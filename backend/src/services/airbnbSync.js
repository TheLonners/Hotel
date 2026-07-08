const { db } = require("../database/db");
const {
  asBoolean,
  asInteger,
  asNumber,
  createReservation,
  getReservation,
  getRoomById,
  updateReservation,
  validateRoomIcalUrl
} = require("./reservations");
const { compareDates, diffNights, parseDateValue, toISODate } = require("./dates");

function cleanText(value) {
  return String(value || "").trim();
}

function unfoldIcs(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "");
}

function unescapeIcs(value) {
  return cleanText(value)
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value) {
  const text = cleanText(value);
  if (!text) return "";
  const dateOnly = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const dateTime = text.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (dateTime) return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`;
  return parseDateValue(text);
}

function parseIcsCalendar(text) {
  const lines = unfoldIcs(text).split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const rawKey = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1);
    if (rawKey === "UID") current.uid = unescapeIcs(value);
    if (rawKey === "SUMMARY") current.summary = unescapeIcs(value);
    if (rawKey === "DESCRIPTION") current.description = unescapeIcs(value);
    if (rawKey === "DTSTART") current.fecha_ingreso = parseIcsDate(value);
    if (rawKey === "DTEND") current.fecha_salida = parseIcsDate(value);
  }

  return events.filter((event) => event.uid && event.fecha_ingreso && event.fecha_salida);
}

function isUnavailableEvent(event) {
  const summary = cleanText(event.summary).toLowerCase();
  return summary.includes("not available") || summary.includes("unavailable") || summary.includes("blocked");
}

function extractGuestName(event) {
  const candidates = [event.description, event.summary].filter(Boolean).join("\n");
  const patterns = [
    /Guest(?:\s+Name)?\s*:\s*([^\n\r]+)/i,
    /Primary\s+Guest\s*:\s*([^\n\r]+)/i,
    /H[uú]esped\s*:\s*([^\n\r]+)/i,
    /Nombre(?:\s+del\s+h[uú]esped)?\s*:\s*([^\n\r]+)/i,
    /Name\s*:\s*([^\n\r]+)/i
  ];

  for (const pattern of patterns) {
    const match = candidates.match(pattern);
    if (!match) continue;
    const name = cleanText(match[1]).replace(/\s+/g, " ");
    if (!name || /^https?:\/\//i.test(name)) continue;
    if (/reservation|phone|airbnb|not available|reserved/i.test(name)) continue;
    return name;
  }

  const summary = cleanText(event.summary).replace(/\s+/g, " ");
  if (summary && !/^(reserved|airbnb\s*\(not available\)|not available|unavailable|blocked)$/i.test(summary)) {
    return summary;
  }

  return "";
}

function airbnbReservationDetails(event) {
  const description = cleanText(event.description);
  const reservationUrl = description.match(/https?:\/\/[^\s]+\/hosting\/reservations\/details\/([A-Z0-9]+)/i);
  const phone = description.match(/Phone Number \(Last 4 Digits\):\s*([0-9]+)/i);
  return {
    code: reservationUrl ? reservationUrl[1].toUpperCase() : "",
    url: reservationUrl ? reservationUrl[0] : "",
    phoneLast4: phone ? phone[1] : "",
    guestName: extractGuestName(event)
  };
}

function listAirbnbFeeds() {
  return db.prepare(`
    SELECT f.*, r.codigo_habitacion, r.nombre_habitacion
    FROM airbnb_sync_feeds f
    JOIN rooms r ON r.id = f.habitacion_id
    ORDER BY f.activo DESC, r.codigo_habitacion COLLATE NOCASE
  `).all();
}

function getAirbnbFeed(id) {
  return db.prepare(`
    SELECT f.*, r.codigo_habitacion, r.nombre_habitacion, r.precio_base_noche
    FROM airbnb_sync_feeds f
    JOIN rooms r ON r.id = f.habitacion_id
    WHERE f.id = ?
  `).get(id);
}

function validateIcalUrl(url) {
  const text = validateRoomIcalUrl(cleanText(url));
  if (!text) {
    const error = new Error("Pega un enlace iCal de Airbnb.");
    error.status = 400;
    throw error;
  }
  return text;
}

function updateRoomAirbnbConfig(roomId, input) {
  db.prepare(`
    UPDATE rooms
    SET airbnb_listing_id = @listing,
        airbnb_ical_url = @url,
        airbnb_ical_activo = @activo,
        fecha_actualizacion = datetime('now')
    WHERE id = @roomId
  `).run({
    roomId,
    listing: cleanText(input.airbnb_listing_id ?? input.nombre ?? ""),
    url: validateIcalUrl(input.airbnb_ical_url ?? input.ical_url ?? ""),
    activo: asBoolean(input.airbnb_ical_activo ?? input.activo ?? 1)
  });
}

function updateRoomAirbnbSyncState(roomId, estado, error = "") {
  db.prepare(`
    UPDATE rooms
    SET airbnb_ultima_sincronizacion = datetime('now'),
        airbnb_ultimo_estado = @estado,
        airbnb_ultimo_error = @error,
        fecha_actualizacion = datetime('now')
    WHERE id = @roomId
  `).run({ roomId, estado, error: cleanText(error) });
}

function roomStatusText({ created = 0, updated = 0, blocked = 0, cancelled = 0, skipped = 0 }) {
  return `OK: ${created} creadas, ${updated} actualizadas, ${blocked} bloqueos, ${cancelled} canceladas, ${skipped} omitidas`;
}

function createAirbnbFeed(input) {
  const roomId = Number(input.habitacion_id || input.roomId);
  const room = getRoomById(roomId);
  if (!room) {
    const error = new Error("Habitacion no encontrada.");
    error.status = 404;
    throw error;
  }

  const info = db.prepare(`
    INSERT INTO airbnb_sync_feeds (habitacion_id, nombre, ical_url, activo, sync_interval_minutes)
    VALUES (@habitacion_id, @nombre, @ical_url, @activo, @sync_interval_minutes)
  `).run({
    habitacion_id: roomId,
    nombre: cleanText(input.nombre) || `Airbnb ${room.codigo_habitacion}`,
    ical_url: validateIcalUrl(input.ical_url),
    activo: asBoolean(input.activo ?? 1),
    sync_interval_minutes: Math.max(15, asInteger(input.sync_interval_minutes, 60))
  });
  updateRoomAirbnbConfig(roomId, {
    airbnb_listing_id: cleanText(input.airbnb_listing_id ?? input.nombre) || `Airbnb ${room.codigo_habitacion}`,
    airbnb_ical_url: input.ical_url,
    airbnb_ical_activo: input.activo ?? 1
  });
  return getAirbnbFeed(info.lastInsertRowid);
}

function updateAirbnbFeed(id, input) {
  const current = getAirbnbFeed(id);
  if (!current) return null;
  const roomId = Number(input.habitacion_id || input.roomId || current.habitacion_id);
  const room = getRoomById(roomId);
  if (!room) {
    const error = new Error("Habitacion no encontrada.");
    error.status = 404;
    throw error;
  }
  db.prepare(`
    UPDATE airbnb_sync_feeds
    SET habitacion_id = @habitacion_id,
        nombre = @nombre,
        ical_url = @ical_url,
        activo = @activo,
        sync_interval_minutes = @sync_interval_minutes,
        fecha_actualizacion = datetime('now')
    WHERE id = @id
  `).run({
    id,
    habitacion_id: roomId,
    nombre: cleanText(input.nombre ?? current.nombre) || `Airbnb ${room.codigo_habitacion}`,
    ical_url: validateIcalUrl(input.ical_url ?? current.ical_url),
    activo: asBoolean(input.activo ?? current.activo),
    sync_interval_minutes: Math.max(15, asInteger(input.sync_interval_minutes ?? current.sync_interval_minutes, 60))
  });
  updateRoomAirbnbConfig(roomId, {
    airbnb_listing_id: cleanText(input.airbnb_listing_id ?? input.nombre ?? current.nombre) || `Airbnb ${room.codigo_habitacion}`,
    airbnb_ical_url: input.ical_url ?? current.ical_url,
    airbnb_ical_activo: input.activo ?? current.activo
  });
  return getAirbnbFeed(id);
}

function deleteAirbnbFeed(id) {
  db.prepare("DELETE FROM airbnb_sync_feeds WHERE id = ?").run(id);
  return true;
}

function eventReservationPayload(feed, event) {
  const nights = Math.max(1, diffNights(event.fecha_ingreso, event.fecha_salida));
  const valueBase = asNumber(feed.precio_base_noche, 0);
  const total = nights * valueBase;
  const summary = cleanText(event.summary) || "Reserved";
  const details = airbnbReservationDetails(event);
  const displayName = details.guestName
    ? details.guestName
    : details.code
    ? `Airbnb ${details.code}`
    : (summary.toLowerCase() === "reserved" ? `Airbnb ${feed.codigo_habitacion}` : summary);
  return {
    numero_interno: "",
    numero_remision: (details.code ? `AIRBNB-${details.code}` : `AIRBNB-${event.uid}`).slice(0, 120),
    nombre_completo_huesped: displayName,
    telefono: details.phoneLast4 ? `****${details.phoneLast4}` : "",
    cantidad_huespedes: 1,
    fecha_ingreso: event.fecha_ingreso,
    fecha_salida: event.fecha_salida,
    noches: nights,
    tipo_estadia: "noche",
    valor_base: valueBase,
    total_pago: total,
    abono: 0,
    saldo: total,
    estado_reserva: "confirmada",
    estado_pago: "sin_pago",
    origen_reserva: "airbnb",
    airbnb_ok: 1,
    observaciones: [
      "Reserva sincronizada automaticamente desde Airbnb iCal.",
      details.guestName ? `Nombre detectado en iCal: ${details.guestName}` : "Nombre del huesped no incluido por Airbnb en este iCal.",
      details.url ? `Reserva Airbnb: ${details.url}` : "",
      details.phoneLast4 ? `Telefono ultimos 4 digitos: ${details.phoneLast4}` : "",
      event.description ? `Detalle iCal: ${event.description}` : "",
      `UID Airbnb: ${event.uid}`
    ].filter(Boolean).join("\n"),
    roomIds: [feed.habitacion_id],
    total_manual: 0
  };
}

function upsertUnavailableBlock(feed, event, existingEvent) {
  const motivo = "Airbnb no disponible";
  const notas = [
    "Bloqueo sincronizado automaticamente desde Airbnb iCal.",
    `Resumen Airbnb: ${event.summary || "Not available"}`,
    `UID Airbnb: ${event.uid}`
  ].join("\n");

  if (existingEvent?.reserva_id && getReservation(existingEvent.reserva_id)) {
    db.prepare("DELETE FROM reservations WHERE id = ?").run(existingEvent.reserva_id);
  }

  let blockId = existingEvent?.block_id || null;
  if (blockId && db.prepare("SELECT id FROM blocks WHERE id = ?").get(blockId)) {
    db.prepare(`
      UPDATE blocks
      SET habitacion_id = @habitacion_id,
          fecha_inicio = @fecha_inicio,
          fecha_fin = @fecha_fin,
          motivo = @motivo,
          notas = @notas,
          origen_bloqueo = 'airbnb',
          tipo_bloqueo = 'airbnb',
          grupo_bloqueo = @grupo_bloqueo
      WHERE id = @id
    `).run({
      id: blockId,
      habitacion_id: feed.habitacion_id,
      fecha_inicio: event.fecha_ingreso,
      fecha_fin: event.fecha_salida,
      motivo,
      notas,
      grupo_bloqueo: `airbnb-feed-${feed.id}`
    });
  } else {
    const info = db.prepare(`
      INSERT INTO blocks (habitacion_id, fecha_inicio, fecha_fin, motivo, notas, origen_bloqueo, tipo_bloqueo, grupo_bloqueo)
      VALUES (@habitacion_id, @fecha_inicio, @fecha_fin, @motivo, @notas, 'airbnb', 'airbnb', @grupo_bloqueo)
    `).run({
      habitacion_id: feed.habitacion_id,
      fecha_inicio: event.fecha_ingreso,
      fecha_fin: event.fecha_salida,
      motivo,
      notas,
      grupo_bloqueo: `airbnb-feed-${feed.id}`
    });
    blockId = info.lastInsertRowid;
  }

  db.prepare(`
    INSERT INTO airbnb_sync_events (feed_id, uid, reserva_id, block_id, summary, fecha_ingreso, fecha_salida, last_seen_at)
    VALUES (@feed_id, @uid, NULL, @block_id, @summary, @fecha_ingreso, @fecha_salida, datetime('now'))
    ON CONFLICT(feed_id, uid) DO UPDATE SET
      reserva_id = NULL,
      block_id = excluded.block_id,
      summary = excluded.summary,
      fecha_ingreso = excluded.fecha_ingreso,
      fecha_salida = excluded.fecha_salida,
      last_seen_at = datetime('now')
  `).run({
    feed_id: feed.id,
    uid: event.uid,
    block_id: blockId,
    summary: event.summary || "",
    fecha_ingreso: event.fecha_ingreso,
    fecha_salida: event.fecha_salida
  });

  return blockId;
}

function addSyncAlert(feed, message, severity = "media") {
  db.prepare(`
    INSERT INTO alerts (tipo_alerta, mensaje, severidad)
    VALUES (?, ?, ?)
  `).run("airbnb_sync", `Airbnb ${feed.codigo_habitacion}: ${message}`, severity);
}

async function fetchIcs(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Hotel Reservas Local Airbnb iCal Sync"
    }
  });
  if (!response.ok) throw new Error(`Airbnb respondio ${response.status}`);
  return response.text();
}

async function syncAirbnbFeed(id) {
  const feed = getAirbnbFeed(id);
  if (!feed) {
    const error = new Error("Sincronizacion Airbnb no encontrada.");
    error.status = 404;
    throw error;
  }
  if (!feed.activo) {
    return { feedId: id, created: 0, updated: 0, cancelled: 0, skipped: 0, status: "inactiva" };
  }

  let created = 0;
  let updated = 0;
  let blocked = 0;
  let cancelled = 0;
  let skipped = 0;

  try {
    const ics = await fetchIcs(feed.ical_url);
    const events = parseIcsCalendar(ics);
    const seen = new Set();

    for (const event of events) {
      seen.add(event.uid);
      const existingEvent = db.prepare("SELECT * FROM airbnb_sync_events WHERE feed_id = ? AND uid = ?").get(feed.id, event.uid);

      try {
        if (isUnavailableEvent(event)) {
          upsertUnavailableBlock(feed, event, existingEvent);
          blocked += 1;
          continue;
        }

        const payload = eventReservationPayload(feed, event);
        let reservation;
        if (existingEvent?.reserva_id && getReservation(existingEvent.reserva_id)) {
          reservation = updateReservation(existingEvent.reserva_id, payload);
          updated += 1;
        } else {
          if (existingEvent?.block_id) {
            db.prepare("DELETE FROM blocks WHERE id = ?").run(existingEvent.block_id);
          }
          reservation = createReservation(payload);
          created += 1;
        }

        db.prepare(`
          INSERT INTO airbnb_sync_events (feed_id, uid, reserva_id, block_id, summary, fecha_ingreso, fecha_salida, last_seen_at)
          VALUES (@feed_id, @uid, @reserva_id, NULL, @summary, @fecha_ingreso, @fecha_salida, datetime('now'))
          ON CONFLICT(feed_id, uid) DO UPDATE SET
            reserva_id = excluded.reserva_id,
            block_id = NULL,
            summary = excluded.summary,
            fecha_ingreso = excluded.fecha_ingreso,
            fecha_salida = excluded.fecha_salida,
            last_seen_at = datetime('now')
        `).run({
          feed_id: feed.id,
          uid: event.uid,
          reserva_id: reservation.id,
          summary: event.summary || "",
          fecha_ingreso: event.fecha_ingreso,
          fecha_salida: event.fecha_salida
        });
      } catch (error) {
        skipped += 1;
        addSyncAlert(feed, `${event.fecha_ingreso} a ${event.fecha_salida}: ${error.message}`, "alta");
      }
    }

    const today = toISODate(new Date());
    const previous = db.prepare("SELECT * FROM airbnb_sync_events WHERE feed_id = ?").all(feed.id);
    for (const item of previous) {
      if (seen.has(item.uid)) continue;
      if (item.block_id) {
        db.prepare("DELETE FROM blocks WHERE id = ?").run(item.block_id);
        cancelled += 1;
        continue;
      }
      if (!item.reserva_id) continue;
      const reservation = getReservation(item.reserva_id);
      if (
        reservation &&
        reservation.origen_reserva === "airbnb" &&
        reservation.estado_reserva !== "cancelada" &&
        compareDates(reservation.fecha_salida, today) >= 0
      ) {
        updateReservation(item.reserva_id, { ...reservation, estado_reserva: "cancelada" });
        cancelled += 1;
      }
    }

    const statusText = roomStatusText({ created, updated, blocked, cancelled, skipped });
    db.prepare(`
      UPDATE airbnb_sync_feeds
      SET last_sync_at = datetime('now'), last_status = @status, last_error = '', fecha_actualizacion = datetime('now')
      WHERE id = @id
    `).run({ id: feed.id, status: statusText });
    updateRoomAirbnbSyncState(feed.habitacion_id, "ok", "");

    return { feedId: feed.id, events: events.length, created, updated, blocked, cancelled, skipped, status: "ok" };
  } catch (error) {
    db.prepare(`
      UPDATE airbnb_sync_feeds
      SET last_sync_at = datetime('now'), last_status = 'error', last_error = @error, fecha_actualizacion = datetime('now')
      WHERE id = @id
    `).run({ id: feed.id, error: error.message });
    updateRoomAirbnbSyncState(feed.habitacion_id, "error", error.message);
    addSyncAlert(feed, `No se pudo sincronizar el enlace iCal: ${error.message}`, "alta");
    throw error;
  }
}

async function testRoomIcalLink(roomId, input = {}) {
  const room = getRoomById(Number(roomId));
  if (!room) {
    const error = new Error("Habitacion no encontrada.");
    error.status = 404;
    throw error;
  }
  try {
    const url = validateIcalUrl(input.airbnb_ical_url ?? room.airbnb_ical_url);
    const ics = await fetchIcs(url);
    const events = parseIcsCalendar(ics);
    updateRoomAirbnbSyncState(room.id, "ok", "");
    return {
      ok: true,
      events: events.length,
      message: `Link valido. Se encontraron ${events.length} eventos.`,
      room: getRoomById(room.id)
    };
  } catch (error) {
    updateRoomAirbnbSyncState(room.id, "error", error.message);
    addSyncAlert({ ...room, codigo_habitacion: room.codigo_habitacion }, `Prueba de link iCal fallida: ${error.message}`, "alta");
    error.status = error.status || 400;
    throw error;
  }
}

async function syncDueAirbnbFeeds() {
  const feeds = db.prepare(`
    SELECT * FROM airbnb_sync_feeds
    WHERE activo = 1
      AND (
        last_sync_at IS NULL OR
        datetime(last_sync_at, '+' || sync_interval_minutes || ' minutes') <= datetime('now')
      )
  `).all();
  const results = [];
  for (const feed of feeds) {
    try {
      results.push(await syncAirbnbFeed(feed.id));
    } catch (error) {
      results.push({ feedId: feed.id, status: "error", error: error.message });
    }
  }
  return results;
}

module.exports = {
  createAirbnbFeed,
  deleteAirbnbFeed,
  getAirbnbFeed,
  listAirbnbFeeds,
  parseIcsCalendar,
  syncAirbnbFeed,
  syncDueAirbnbFeeds,
  testRoomIcalLink,
  updateAirbnbFeed
};
