const { db } = require("../database/db");
const { recordAudit } = require("./audit");

function text(value) { return String(value ?? "").trim(); }
function normalizeName(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " "); }
function normalizePhone(value) { return text(value).replace(/[^\d+]/g, ""); }
function normalizeEmail(value) { return text(value).toLowerCase(); }

function guestPayload(input = {}) {
  const original = text(input.full_name_original ?? input.nombre_completo ?? input.name);
  const names = original.split(/\s+/).filter(Boolean);
  const phone = normalizePhone(input.phone_normalized ?? input.phone_number ?? input.telefono);
  return {
    first_name: text(input.first_name ?? input.nombre ?? names[0]),
    last_name: text(input.last_name ?? input.apellido ?? names.slice(1).join(" ")),
    full_name_original: original,
    document_type: text(input.document_type ?? input.tipo_documento),
    document_number: text(input.document_number ?? input.cedula),
    document_country: text(input.document_country),
    phone_country_code: text(input.phone_country_code),
    phone_number: text(input.phone_number ?? input.telefono),
    phone_normalized: phone,
    phone_last4: phone.replace(/\D/g, "").slice(-4),
    email: normalizeEmail(input.email ?? input.correo),
    nationality: text(input.nationality),
    preferred_language: text(input.preferred_language),
    birth_date: text(input.birth_date),
    source: text(input.source) || "MANUAL",
    profile_status: text(input.profile_status) || "ACTIVE",
    identity_confidence: text(input.identity_confidence) || "UNVERIFIED",
    source_reservation_id: input.source_reservation_id || null,
    requires_review: input.requires_review ? 1 : 0
  };
}

function duplicateCandidates(payload, excludeId = null) {
  // node:sqlite rejects surplus named parameters. Keep this binding explicit so
  // callers can safely pass the complete guest payload.
  const rows = db.prepare(`
    SELECT * FROM guests
    WHERE merged_into_guest_id IS NULL
      AND (@excludeId IS NULL OR id != @excludeId)
      AND ((@document_number <> '' AND document_number = @document_number AND document_type = @document_type)
        OR (@phone_normalized <> '' AND phone_normalized = @phone_normalized)
        OR (@email <> '' AND lower(email) = lower(@email)))
    ORDER BY id DESC
  `).all({
    document_number: payload.document_number,
    document_type: payload.document_type,
    phone_normalized: payload.phone_normalized,
    email: payload.email,
    excludeId
  });
  return rows;
}

function createGuest(input, actorUserId = null) {
  const payload = guestPayload(input);
  if (!payload.full_name_original) {
    const error = new Error("El nombre del huesped es obligatorio."); error.status = 400; throw error;
  }
  const duplicates = duplicateCandidates(payload);
  const info = db.prepare(`
    INSERT INTO guests (
      first_name,last_name,full_name_original,document_type,document_number,document_country,
      phone_country_code,phone_number,phone_normalized,phone_last4,email,nationality,
      preferred_language,birth_date,source,profile_status,identity_confidence,source_reservation_id,requires_review
    ) VALUES (
      @first_name,@last_name,@full_name_original,@document_type,@document_number,@document_country,
      @phone_country_code,@phone_number,@phone_normalized,@phone_last4,@email,@nationality,
      @preferred_language,@birth_date,@source,@profile_status,@identity_confidence,@source_reservation_id,@requires_review
    )
  `).run({ ...payload, requires_review: payload.requires_review || (duplicates.length ? 1 : 0) });
  const guest = getGuest(info.lastInsertRowid);
  recordAudit({ actorUserId, action: "create", entityType: "guest", entityId: guest.id, details: { source: guest.source } });
  return { ...guest, duplicate_candidates: duplicates.map((item) => item.id) };
}

function getGuest(id) {
  const guest = db.prepare("SELECT * FROM guests WHERE id = ?").get(Number(id));
  if (!guest) return null;
  const reservations = db.prepare(`
    SELECT r.*, rg.is_primary_guest, rg.guest_category, rg.check_in_completed, rg.check_out_completed
    FROM reservation_guests rg JOIN reservations r ON r.id = rg.reservation_id
    WHERE rg.guest_id = ? ORDER BY date(r.fecha_ingreso) DESC
  `).all(guest.id);
  return { ...guest, reservations };
}

function searchGuests(query = "") {
  const needle = `%${text(query)}%`;
  return db.prepare(`
    SELECT g.*, COUNT(rg.id) AS reservation_count
    FROM guests g LEFT JOIN reservation_guests rg ON rg.guest_id = g.id
    WHERE g.merged_into_guest_id IS NULL
      AND (? = '' OR g.full_name_original LIKE ? COLLATE NOCASE OR g.document_number LIKE ? OR g.phone_normalized LIKE ? OR g.email LIKE ? COLLATE NOCASE)
    GROUP BY g.id ORDER BY g.updated_at DESC, g.id DESC LIMIT 100
  `).all(text(query), needle, needle, needle, needle);
}

function linkGuest(reservationId, guestId, { isPrimaryGuest = false, guestCategory = "adult", inTransaction = false } = {}, actorUserId = null) {
  const reservation = db.prepare("SELECT id FROM reservations WHERE id = ?").get(Number(reservationId));
  const guest = db.prepare("SELECT id FROM guests WHERE id = ? AND merged_into_guest_id IS NULL").get(Number(guestId));
  if (!reservation || !guest) { const error = new Error("Reserva o huesped no encontrado."); error.status = 404; throw error; }
  const link = () => {
    if (isPrimaryGuest) db.prepare("UPDATE reservation_guests SET is_primary_guest = 0 WHERE reservation_id = ?").run(reservation.id);
    db.prepare(`INSERT INTO reservation_guests (reservation_id, guest_id, is_primary_guest, guest_category)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(reservation_id, guest_id) DO UPDATE SET is_primary_guest = excluded.is_primary_guest, guest_category = excluded.guest_category
    `).run(reservation.id, guest.id, isPrimaryGuest ? 1 : 0, guestCategory);
    if (isPrimaryGuest) db.prepare("UPDATE reservations SET primary_guest_id = ?, fecha_actualizacion = datetime('now') WHERE id = ?").run(guest.id, reservation.id);
  };
  const transaction = db.transaction(link);
  if (inTransaction) link();
  else transaction();
  recordAudit({ actorUserId, action: "link", entityType: "reservation_guest", entityId: `${reservation.id}:${guest.id}` });
}

function createProvisionalAirbnbGuest(reservation, actorUserId = null, { inTransaction = false } = {}) {
  const existing = db.prepare("SELECT guest_id FROM reservation_guests WHERE reservation_id = ? AND is_primary_guest = 1").get(reservation.id);
  if (existing) return getGuest(existing.guest_id);
  const guest = createGuest({
    full_name_original: reservation.nombre_completo_huesped,
    source: "AIRBNB",
    profile_status: "PROVISIONAL_FROM_AIRBNB",
    identity_confidence: "LOW",
    source_reservation_id: reservation.id,
    requires_review: true
  }, actorUserId);
  linkGuest(reservation.id, guest.id, { isPrimaryGuest: true, inTransaction }, actorUserId);
  return getGuest(guest.id);
}

module.exports = { createGuest, createProvisionalAirbnbGuest, getGuest, guestPayload, linkGuest, normalizeName, searchGuests };
