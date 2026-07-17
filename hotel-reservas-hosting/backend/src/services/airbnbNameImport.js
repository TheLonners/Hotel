const XLSX = require("xlsx");
const { db } = require("../database/db");
const { diffNights, parseDateValue } = require("./dates");
const {
  createReservation,
  getReservation,
  recalculateReservationPayments,
  updateReservation
} = require("./reservations");

const aliases = {
  type: ["tipo", "type"],
  code: [
    "codigo reserva",
    "código reserva",
    "codigo de reserva",
    "código de reserva",
    "codigo confirmacion",
    "código confirmación",
    "codigo de confirmacion",
    "código de confirmación",
    "confirmation",
    "confirmation code",
    "confirmation number",
    "confirmation code",
    "reservation code",
    "reserva",
    "reservation",
    "url reserva",
    "reservation url",
    "enlace"
  ],
  name: [
    "nombre huesped",
    "nombre huésped",
    "nombre del huesped",
    "nombre del huésped",
    "huesped",
    "huésped",
    "guest",
    "guest name",
    "nombre",
    "name"
  ],
  phone: ["telefono", "teléfono", "phone", "celular", "mobile"],
  checkIn: ["check in", "check-in", "fecha ingreso", "fecha de inicio", "entrada", "arrival", "start date"],
  checkOut: ["check out", "check-out", "fecha salida", "fecha de finalizacion", "fecha de finalización", "salida", "departure", "end date"],
  listing: ["anuncio", "listing", "alojamiento", "property", "listing name"],
  listingId: ["listing id", "id listing", "id anuncio", "airbnb listing id", "identificador del anuncio", "property id"],
  nights: ["noches", "nights"],
  paymentDate: ["fecha de pago", "payout date", "date", "fecha", "llega en esta fecha"],
  gross: ["ingresos brutos", "gross earnings", "gross amount", "total pagado"],
  amount: ["monto", "amount", "payout", "net payout", "paid out", "total pagado"],
  fee: ["tarifa por servicio", "service fee", "comision", "comisión", "fees"],
  net: ["neto", "net earnings", "net amount"]
};

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "").trim();
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") && text.lastIndexOf(",") > text.lastIndexOf(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAirbnbDateValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return parseDateValue(value);
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return parseDateValue(value);
}

function asInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valueFromRow(row, field) {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    normalized[normalizeHeader(key)] = row[key];
  });
  for (const alias of aliases[field]) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized[key];
  }
  return "";
}

function extractReservationCode(value) {
  const text = cleanText(value).toUpperCase();
  const match = text.match(/\bHM[A-Z0-9]{6,}\b/);
  if (match) return match[0];
  const compact = text.match(/\b[A-Z0-9]{6,16}\b/);
  return compact ? compact[0] : "";
}

function last4(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function normalizeType(value) {
  return normalizeHeader(value);
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
}

function addImportAlert(message, severity = "media") {
  db.prepare(`
    INSERT INTO alerts (tipo_alerta, mensaje, severidad)
    VALUES (?, ?, ?)
  `).run("airbnb_csv", message, severity);
}

function findReservation({ code, phoneLast4, checkIn, checkOut }) {
  if (code) {
    return db.prepare(`
      SELECT * FROM reservations
      WHERE origen_reserva = 'airbnb'
        AND (numero_remision LIKE @codeLike OR observaciones LIKE @detailsLike OR observaciones LIKE @plainLike)
      ORDER BY id DESC
      LIMIT 1
    `).get({
      codeLike: `%${code}%`,
      detailsLike: `%details/${code}%`,
      plainLike: `%${code}%`
    });
  }

  if (phoneLast4 && checkIn && checkOut) {
    return db.prepare(`
      SELECT * FROM reservations
      WHERE origen_reserva = 'airbnb'
        AND telefono LIKE @phoneLike
        AND fecha_ingreso = @checkIn
        AND fecha_salida = @checkOut
      ORDER BY id DESC
      LIMIT 1
    `).get({ phoneLike: `%${phoneLast4}`, checkIn, checkOut });
  }

  return null;
}

function normalizeListing(value) {
  return normalizeHeader(value).replace(/\b(habitacion|habitacion|room|airbnb|anuncio|listing)\b/g, "").trim();
}

function selectSingleListingAlias(aliases) {
  const manualAliases = aliases.filter((room) => room.source === "MANUAL_IMPORT");
  if (manualAliases.length === 1) return manualAliases[0];
  return aliases.length === 1 ? aliases[0] : null;
}

function findRoomForListing(listing, listingMappings = {}, listingId = "") {
  const mappedRoomId = listingMappings[listing] || listingMappings[normalizeHeader(listing)];
  if (mappedRoomId) {
    const room = db.prepare("SELECT id AS habitacion_id, codigo_habitacion, nombre_habitacion FROM rooms WHERE id = ?").get(Number(mappedRoomId));
    if (room) return room;
  }
  const verifiedListingId = cleanText(listingId);
  if (verifiedListingId) {
    const rooms = db.prepare(`
      SELECT r.id AS habitacion_id, r.codigo_habitacion, r.nombre_habitacion
      FROM airbnb_listing_aliases a JOIN rooms r ON r.id = a.room_id
      WHERE a.is_active = 1 AND lower(trim(a.listing_id)) = lower(trim(?))
      LIMIT 2
    `).all(verifiedListingId);
    if (rooms.length === 1) return rooms[0];
  }
  const normalizedListing = normalizeListing(listing);
  if (!normalizedListing) return null;
  const alias = db.prepare(`
    SELECT r.id AS habitacion_id, r.codigo_habitacion, r.nombre_habitacion, a.source
    FROM airbnb_listing_aliases a
    JOIN rooms r ON r.id = a.room_id
    WHERE a.is_active = 1 AND a.listing_name_normalized = ?
    ORDER BY CASE WHEN a.source = 'MANUAL_IMPORT' THEN 0 ELSE 1 END, a.id
  `).all(normalizedListing);
  // A choice made during a previous import is an explicit override.  Airbnb
  // reuses several listing names, so the verified directory alone can contain
  // more than one room for the same name.
  const selectedAlias = selectSingleListingAlias(alias);
  if (selectedAlias) return selectedAlias;
  const exactName = db.prepare(`
    SELECT id AS habitacion_id, codigo_habitacion, nombre_habitacion
    FROM rooms
    WHERE lower(trim(nombre_habitacion)) = lower(trim(?))
    LIMIT 2
  `).all(listing);
  return exactName.length === 1 ? exactName[0] : null;
}

function detectAirbnbProfile(rows) {
  const headers = new Set(Object.keys(rows[0] || {}).map(normalizeHeader));
  const types = new Set(rows.map((row) => normalizeType(valueFromRow(row, "type"))).filter(Boolean));
  const hasEnglishPendingColumns = headers.has("confirmation code") && headers.has("start date") && headers.has("gross earnings");
  const hasHistoricalColumns = headers.has("codigo de confirmacion") && headers.has("ingresos brutos");
  if (hasEnglishPendingColumns && [...types].every((type) => type === "reservation")) return "AIRBNB_PENDING";
  if (hasHistoricalColumns || types.has("payout") || types.has("ajuste de la resolucion")) return "AIRBNB_HISTORY";
  return "AMBIGUOUS";
}

function rememberListingAlias(roomId, listing, listingId = "") {
  const normalized = normalizeListing(listing);
  if (!roomId || !normalized) return;
  db.prepare(`
    INSERT INTO airbnb_listing_aliases (room_id, listing_id, listing_name_original, listing_name_normalized, source, is_active)
    VALUES (?, ?, ?, ?, 'MANUAL_IMPORT', 1)
    ON CONFLICT(room_id, listing_name_normalized) DO UPDATE SET
      listing_id = CASE WHEN excluded.listing_id <> '' THEN excluded.listing_id ELSE airbnb_listing_aliases.listing_id END,
      listing_name_original = excluded.listing_name_original,
      source = excluded.source,
      is_active = 1
  `).run(roomId, cleanText(listingId), listing, normalized);
}

function isAvailabilityConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.status) === 409 && (message.includes("disponibilidad") || message.includes("cruza"));
}

function mergeNotes(existing, additions) {
  const current = cleanText(existing);
  const next = additions.filter(Boolean).map(cleanText).filter(Boolean);
  const currentParts = current ? current.split("\n") : [];
  return [...currentParts, ...next.filter((line) => !currentParts.includes(line))].join("\n");
}

function upsertAirbnbPayment(reservationId, { code, amount, totalAmount, paymentDate, fileName }) {
  const reference = `AIRBNB-${code || reservationId}`;
  // Airbnb reservations are settled in full by the platform.  Keep any
  // unrelated payments already recorded, and make the canonical Airbnb
  // payment cover the remaining amount up to the reservation total.
  const existing = db.prepare(`
    SELECT id FROM payments
    WHERE reserva_id = ? AND referencia_pago = ?
    LIMIT 1
  `).get(reservationId, reference);
  const otherPaid = totalAmount !== undefined && totalAmount !== null
    ? Number(db.prepare(`
      SELECT COALESCE(SUM(monto), 0) AS total
      FROM payments
      WHERE reserva_id = ? AND (referencia_pago IS NULL OR referencia_pago <> ?)
    `).get(reservationId, reference)?.total || 0)
    : 0;
  const targetAmount = totalAmount !== undefined && totalAmount !== null
    ? Math.max(Number(totalAmount) - otherPaid, 0)
    : Number(amount || 0);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    recalculateReservationPayments(reservationId);
    return false;
  }
  if (existing) {
    db.prepare(`
      UPDATE payments
      SET monto = ?, fecha_pago = ?, metodo_pago = 'airbnb', banco_o_medio = 'Airbnb',
          nota = ?, fecha_creacion = fecha_creacion
      WHERE id = ?
    `).run(targetAmount, paymentDate || "", `Reserva Airbnb pagada totalmente por Airbnb. Importada desde ${fileName}. No requiere comprobante.`, existing.id);
  } else {
    db.prepare(`
      INSERT INTO payments (reserva_id, monto, fecha_pago, metodo_pago, banco_o_medio, referencia_pago, nota)
      VALUES (?, ?, ?, 'airbnb', 'Airbnb', ?, ?)
    `).run(reservationId, targetAmount, paymentDate || "", reference, `Reserva Airbnb pagada totalmente por Airbnb. Importada desde ${fileName}. No requiere comprobante.`);
  }
  recalculateReservationPayments(reservationId);
  return true;
}

function analyzeAirbnbRows(buffer, fileName) {
  const rows = parseWorkbook(buffer);
  const profile = detectAirbnbProfile(rows);
  const previewRows = [];
  let canImportCount = 0;
  let createCount = 0;
  let updateCount = 0;
  let alertCount = 0;
  const seenReservationCodes = new Set();
  const unmappedListings = new Set();

  rows.forEach((row, index) => {
    const type = normalizeType(valueFromRow(row, "type"));
    const rowNumber = index + 2;
    if (type && !["reservacion", "reservation"].includes(type)) {
      const ignored = ["payout", "ajuste de la resolucion"].includes(type);
      const cancellation = type === "tarifa de cancelacion";
      previewRows.push({ rowNumber, action: ignored ? "IGNORED" : cancellation ? "WARNING" : "REQUIRES_REVIEW", canImport: false, alerts: [{ severidad: ignored ? "baja" : "media", mensaje: ignored ? `Fila ${valueFromRow(row, "type")} ignorada por política.` : `Fila tipo ${valueFromRow(row, "type")} requiere revisión financiera.` }], data: {} });
      alertCount += 1;
      return;
    }

    const rawCode = valueFromRow(row, "code");
    const code = extractReservationCode(rawCode || Object.values(row).join(" "));
    const name = cleanText(valueFromRow(row, "name")).replace(/\s+/g, " ");
    const phone = cleanText(valueFromRow(row, "phone"));
    const checkIn = parseAirbnbDateValue(valueFromRow(row, "checkIn"));
    const checkOut = parseAirbnbDateValue(valueFromRow(row, "checkOut"));
    const listing = cleanText(valueFromRow(row, "listing"));
    const listingId = cleanText(valueFromRow(row, "listingId"));
    const amount = parseMoney(valueFromRow(row, "amount")) || parseMoney(valueFromRow(row, "gross"));
    const duplicateInFile = Boolean(code && seenReservationCodes.has(code));
    if (code) seenReservationCodes.add(code);
    const reservation = findReservation({ code, phoneLast4: last4(phone), checkIn, checkOut });
    const mappedRoom = reservation ? null : findRoomForListing(listing, {}, listingId);
    const alerts = [];

    if (!code) alerts.push({ severidad: "media", mensaje: "No se detecto codigo de reserva Airbnb." });
    if (!name) alerts.push({ severidad: "baja", mensaje: "No viene nombre de huesped." });
    if (!checkIn || !checkOut) alerts.push({ severidad: "alta", mensaje: "Fechas de check-in/check-out invalidas." });
    if (!reservation && !mappedRoom) alerts.push({ severidad: "media", mensaje: `No se pudo mapear anuncio "${listing || "sin anuncio"}" a habitacion.` });
    if (!reservation && !mappedRoom && listing) unmappedListings.add(listing);
    if (duplicateInFile) alerts.push({ severidad: "baja", mensaje: `El código ${code} se repite en el archivo; se consolidará en la misma reserva.` });

    const canImport = !alerts.some((alert) => alert.severidad === "alta") && Boolean(reservation || mappedRoom);
    const action = reservation || duplicateInFile ? "actualizar" : canImport ? "crear" : "revisar";
    if (canImport) canImportCount += 1;
    if (action === "crear") createCount += 1;
    if (action === "actualizar") updateCount += 1;
    alertCount += alerts.length;

    previewRows.push({
      rowNumber,
      action,
      canImport,
      alerts,
      data: {
        code,
        nombre_huesped: name,
        anuncio: listing,
        anuncio_id: listingId,
        fecha_ingreso: checkIn,
        fecha_salida: checkOut,
        monto: amount,
        habitacion: reservation ? "reserva existente" : mappedRoom ? mappedRoom.codigo_habitacion : ""
      }
    });
  });

  return {
    nombre_archivo: fileName,
    profile,
    filas: rows.length,
    canImportCount,
    createCount,
    updateCount,
    alertCount,
    unmappedListings: [...unmappedListings].sort((left, right) => left.localeCompare(right, "es")),
    rows: previewRows.slice(0, 150),
    alerts: previewRows.flatMap((row) => row.alerts.map((alert) => ({ ...alert, rowNumber: row.rowNumber }))).slice(0, 100)
  };
}

function importAirbnbNames(buffer, fileName, options = {}) {
  const rows = parseWorkbook(buffer);
  const profile = detectAirbnbProfile(rows);
  if (profile === "AMBIGUOUS") {
    const error = new Error("No se pudo identificar si el archivo Airbnb es de próximas reservas o histórico.");
    error.status = 400;
    throw error;
  }
  const results = [];
  let updated = 0;
  let created = 0;
  let skipped = 0;
  let payments = 0;
  let alerts = 0;

  const transaction = db.transaction(() => {
    rows.forEach((row, index) => {
      const type = normalizeType(valueFromRow(row, "type"));
      if (type && !["reservacion", "reservation"].includes(type)) {
        skipped += 1;
        results.push({ rowNumber: index + 2, status: "omitida", message: `Fila tipo ${valueFromRow(row, "type")} no es una reserva.` });
        return;
      }

      const rawCode = valueFromRow(row, "code");
      const code = extractReservationCode(rawCode || Object.values(row).join(" "));
      const name = cleanText(valueFromRow(row, "name")).replace(/\s+/g, " ");
      const phone = cleanText(valueFromRow(row, "phone"));
      const phoneLast4 = last4(phone);
      const checkIn = parseAirbnbDateValue(valueFromRow(row, "checkIn"));
      const checkOut = parseAirbnbDateValue(valueFromRow(row, "checkOut"));
      const listing = cleanText(valueFromRow(row, "listing"));
      const listingId = cleanText(valueFromRow(row, "listingId"));
      const nights = asInteger(valueFromRow(row, "nights"), checkIn && checkOut ? diffNights(checkIn, checkOut) : 0);
      const paymentDate = parseAirbnbDateValue(valueFromRow(row, "paymentDate"));
      const gross = parseMoney(valueFromRow(row, "gross"));
      const amount = parseMoney(valueFromRow(row, "amount")) || gross;
      const fee = parseMoney(valueFromRow(row, "fee"));
      const net = parseMoney(valueFromRow(row, "net"));

      if (!code && !phoneLast4 && !checkIn) {
        skipped += 1;
        results.push({ rowNumber: index + 2, status: "omitida", message: "Sin codigo, telefono o fecha para cruzar." });
        return;
      }

      const reservation = findReservation({ code, phoneLast4, checkIn, checkOut });
      const notes = [
        `Archivo Airbnb: ${fileName}.`,
        listing ? `Anuncio Airbnb: ${listing}` : "",
        gross ? `Ingresos brutos Airbnb CSV: ${gross}` : "",
        amount ? `Monto Airbnb CSV: ${amount}` : "",
        fee ? `Comision Airbnb CSV: ${fee}` : "",
        net ? `Neto Airbnb CSV: ${net}` : ""
      ];

      if (reservation) {
        const payload = {
          numero_remision: code ? `AIRBNB-${code}` : reservation.numero_remision,
          nombre_completo_huesped: name || reservation.nombre_completo_huesped,
          telefono: phone || reservation.telefono,
          fecha_ingreso: checkIn || reservation.fecha_ingreso,
          fecha_salida: checkOut || reservation.fecha_salida,
          noches: nights || reservation.noches,
          total_pago: gross || amount || reservation.total_pago,
          valor_base: nights ? (gross || amount || reservation.total_pago || 0) / nights : reservation.valor_base,
          banco_o_medio_pago: "Airbnb",
          metodo_pago: "airbnb",
          estado_reserva: "confirmada",
          origen_reserva: "airbnb",
          airbnb_ok: 1,
          observaciones: mergeNotes(reservation.observaciones, notes)
        };
        let saved;
        try {
          saved = updateReservation(reservation.id, payload);
        } catch (error) {
          if (!isAvailabilityConflict(error)) throw error;
          skipped += 1;
          alerts += 1;
          const message = `Fila ${index + 2}: reserva ${code || "Airbnb"} omitida porque sus fechas se cruzan con otra reserva existente.`;
          addImportAlert(message, "media");
          results.push({ rowNumber: index + 2, code, name, listing, status: "omitida", message });
          return;
        }
        if (upsertAirbnbPayment(saved.id, {
          code,
          amount,
          totalAmount: Number(payload.total_pago || 0),
          paymentDate,
          fileName
        })) payments += 1;
        updated += 1;
        results.push({ rowNumber: index + 2, code: code || reservation.numero_remision, name: payload.nombre_completo_huesped, reservationId: reservation.id, status: "actualizada" });
        return;
      }

      const mappedRoom = findRoomForListing(listing, options.listingMappings || {}, listingId);
      if (!mappedRoom) {
        skipped += 1;
        alerts += 1;
        const message = `Fila ${index + 2}: no se pudo mapear el anuncio Airbnb "${listing || "sin anuncio"}" a una habitacion.`;
        addImportAlert(message, "media");
        results.push({ rowNumber: index + 2, code, name, listing, status: "omitida", message });
        return;
      }

      if (options.listingMappings && (options.listingMappings[listing] || options.listingMappings[normalizeHeader(listing)])) {
        rememberListingAlias(mappedRoom.habitacion_id, listing, listingId);
      }

      if (!checkIn || !checkOut) {
        skipped += 1;
        alerts += 1;
        const message = `Fila ${index + 2}: reserva Airbnb ${code || ""} sin fechas de ingreso/salida validas.`;
        addImportAlert(message, "alta");
        results.push({ rowNumber: index + 2, code, name, listing, status: "omitida", message });
        return;
      }

      const total = gross || amount || 0;
      let saved;
      try {
        saved = createReservation({
          numero_remision: code ? `AIRBNB-${code}` : "",
          nombre_completo_huesped: name || (code ? `Airbnb ${code}` : "Airbnb"),
          telefono: phone,
          cantidad_huespedes: 1,
          fecha_ingreso: checkIn,
          fecha_salida: checkOut,
          noches: nights || diffNights(checkIn, checkOut),
          valor_base: nights ? total / nights : total,
          total_pago: total,
          banco_o_medio_pago: "Airbnb",
          metodo_pago: "airbnb",
          estado_reserva: "confirmada",
          origen_reserva: "airbnb",
          airbnb_ok: 1,
          observaciones: mergeNotes("", [
            "Reserva creada desde archivo CSV/Excel de Airbnb.",
            ...notes
          ]),
          roomIds: [mappedRoom.habitacion_id],
          total_manual: 1
        });
      } catch (error) {
        if (!isAvailabilityConflict(error)) throw error;
        skipped += 1;
        alerts += 1;
        const message = `Fila ${index + 2}: reserva ${code || "Airbnb"} omitida porque sus fechas se cruzan con otra reserva del archivo.`;
        addImportAlert(message, "media");
        results.push({ rowNumber: index + 2, code, name, listing, status: "omitida", message });
        return;
      }
      if (upsertAirbnbPayment(saved.id, {
        code,
        amount,
        totalAmount: Number(saved.total_pago || total || 0),
        paymentDate,
        fileName
      })) payments += 1;
      created += 1;
      results.push({ rowNumber: index + 2, code, name: saved.nombre_completo_huesped, reservationId: saved.id, status: "creada" });
    });

    // Enforce the Airbnb settlement policy for older iCal/import records that
    // are not present in this particular CSV.  WhatsApp/manual reservations
    // are intentionally excluded by the origin filter.
    const existingAirbnbReservations = db.prepare(`
      SELECT id, numero_remision, total_pago, fecha_ingreso
      FROM reservations
      WHERE origen_reserva = 'airbnb' AND total_pago > 0
    `).all();
    const settlementDate = new Date().toISOString().slice(0, 10);
    existingAirbnbReservations.forEach((airbnbReservation) => {
      const codeFromReference = cleanText(airbnbReservation.numero_remision).replace(/^AIRBNB-/i, "");
      if (upsertAirbnbPayment(airbnbReservation.id, {
        code: codeFromReference,
        totalAmount: Number(airbnbReservation.total_pago),
        paymentDate: airbnbReservation.fecha_ingreso || settlementDate,
        fileName
      })) payments += 1;
    });
  });

  transaction();

  return {
    nombre_archivo: fileName,
    profile,
    filas: rows.length,
    creadas: created,
    actualizadas: updated,
    omitidas: skipped,
    pagos: payments,
    alertas: alerts,
    resultados: results.slice(0, 200)
  };
}

module.exports = {
  importAirbnbNames,
  previewAirbnbImport: analyzeAirbnbRows,
  detectAirbnbProfile,
  findRoomForListing,
  rememberListingAlias,
  selectSingleListingAlias
};
