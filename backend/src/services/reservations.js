const { db } = require("../database/db");
const { compareDates, diffNights, effectiveCheckOut, parseDateValue } = require("./dates");
const { sortRooms } = require("./roomOrdering");

function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;
  const text = String(value || "").trim().toLowerCase();
  return ["1", "si", "sí", "s", "yes", "y", "ok", "x", "true", "hecho"].includes(text) ? 1 : 0;
}

function computePaymentStatus(total, paid) {
  if (paid <= 0) return "sin_pago";
  if (paid >= total) return "pagado_total";
  return "saldo_pendiente";
}

function normalizeReservationOrigin(value) {
  return String(value || "").trim().toLowerCase() === "airbnb" ? "airbnb" : "whatsapp";
}

function roomColor(index) {
  const palette = ["#4f9da6", "#6c8ebf", "#78a76d", "#c58b57", "#9a7bb8", "#b46b72", "#5f9f8f"];
  return palette[index % palette.length];
}

function validateRoomIcalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  let parsed;
  try {
    parsed = new URL(text);
  } catch (_error) {
    const error = new Error("La URL iCal de Airbnb debe tener formato de URL valido.");
    error.status = 400;
    throw error;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error("La URL iCal de Airbnb debe empezar por http o https.");
    error.status = 400;
    throw error;
  }

  if (!/\.ics$/i.test(parsed.pathname) && !/ical/i.test(parsed.pathname)) {
    const error = new Error("La URL iCal de Airbnb debe terminar en .ics o contener una ruta iCal valida.");
    error.status = 400;
    throw error;
  }

  return text;
}

function mirrorRoomAirbnbFeed(room) {
  if (!room) return;
  const url = validateRoomIcalUrl(room.airbnb_ical_url);
  const existing = db.prepare(`
    SELECT * FROM airbnb_sync_feeds
    WHERE habitacion_id = ?
    ORDER BY activo DESC, id DESC
    LIMIT 1
  `).get(room.id);

  if (!url) {
    if (existing) {
      db.prepare("UPDATE airbnb_sync_feeds SET activo = 0, fecha_actualizacion = datetime('now') WHERE id = ?").run(existing.id);
    }
    return;
  }

  const payload = {
    id: existing?.id,
    habitacion_id: room.id,
    nombre: String(room.airbnb_listing_id || "").trim() || `Airbnb ${room.codigo_habitacion}`,
    ical_url: url,
    activo: asBoolean(room.airbnb_ical_activo),
    sync_interval_minutes: existing?.sync_interval_minutes || 60
  };

  if (existing) {
    db.prepare(`
      UPDATE airbnb_sync_feeds
      SET nombre = @nombre,
          ical_url = @ical_url,
          activo = @activo,
          sync_interval_minutes = @sync_interval_minutes,
          fecha_actualizacion = datetime('now')
      WHERE id = @id
    `).run(payload);
  } else {
    db.prepare(`
      INSERT INTO airbnb_sync_feeds (habitacion_id, nombre, ical_url, activo, sync_interval_minutes)
      VALUES (@habitacion_id, @nombre, @ical_url, @activo, @sync_interval_minutes)
    `).run({
      habitacion_id: payload.habitacion_id,
      nombre: payload.nombre,
      ical_url: payload.ical_url,
      activo: payload.activo,
      sync_interval_minutes: payload.sync_interval_minutes
    });
  }
}

function getRoomById(id) {
  return db.prepare("SELECT * FROM rooms WHERE id = ?").get(id);
}

function getRoomByCode(code) {
  return db.prepare("SELECT * FROM rooms WHERE lower(codigo_habitacion) = lower(?)").get(String(code || "").trim());
}

function createRoom(input) {
  const existing = getRoomByCode(input.codigo_habitacion);
  if (existing) return existing;
  const count = db.prepare("SELECT COUNT(*) AS total FROM rooms").get().total;
  const info = db.prepare(`
      INSERT INTO rooms (
      codigo_habitacion, nombre_habitacion, tipo_habitacion, descripcion, acomodacion, capacidad,
      camas, tipo_cama, sofa_cama, tipo_vista, tina, jacuzzi_interno,
      precio_base_noche, estado, color_calendario, pendiente_revision,
      airbnb_listing_id, airbnb_ical_url, airbnb_ical_activo
    )
    VALUES (@codigo_habitacion, @nombre_habitacion, @tipo_habitacion, @descripcion, @acomodacion, @capacidad,
      @camas, @tipo_cama, @sofa_cama, @tipo_vista, @tina, @jacuzzi_interno,
      @precio_base_noche, @estado, @color_calendario, @pendiente_revision,
      @airbnb_listing_id, @airbnb_ical_url, @airbnb_ical_activo)
  `).run({
    codigo_habitacion: String(input.codigo_habitacion || "").trim(),
    nombre_habitacion: String(input.nombre_habitacion || input.codigo_habitacion || "").trim(),
    tipo_habitacion: input.tipo_habitacion || "",
    descripcion: input.descripcion || "",
    acomodacion: input.acomodacion || "",
    capacidad: asInteger(input.capacidad, 2),
    camas: asInteger(input.camas, 0),
    tipo_cama: input.tipo_cama || "",
    sofa_cama: asInteger(input.sofa_cama, 0),
    tipo_vista: input.tipo_vista || "",
    tina: input.tina || "",
    jacuzzi_interno: input.jacuzzi_interno || "",
    precio_base_noche: asNumber(input.precio_base_noche, 0),
    estado: input.estado || "disponible",
    color_calendario: input.color_calendario || roomColor(count),
    pendiente_revision: asBoolean(input.pendiente_revision),
    airbnb_listing_id: String(input.airbnb_listing_id || "").trim(),
    airbnb_ical_url: validateRoomIcalUrl(input.airbnb_ical_url),
    airbnb_ical_activo: asBoolean(input.airbnb_ical_activo)
  });
  const room = getRoomById(info.lastInsertRowid);
  mirrorRoomAirbnbFeed(room);
  return room;
}

function updateRoom(id, input) {
  const current = getRoomById(id);
  if (!current) return null;
  db.prepare(`
    UPDATE rooms
    SET codigo_habitacion = @codigo_habitacion,
        nombre_habitacion = @nombre_habitacion,
        tipo_habitacion = @tipo_habitacion,
        descripcion = @descripcion,
        acomodacion = @acomodacion,
        capacidad = @capacidad,
        camas = @camas,
        tipo_cama = @tipo_cama,
        sofa_cama = @sofa_cama,
        tipo_vista = @tipo_vista,
        tina = @tina,
        jacuzzi_interno = @jacuzzi_interno,
        precio_base_noche = @precio_base_noche,
        estado = @estado,
        color_calendario = @color_calendario,
        pendiente_revision = @pendiente_revision,
        airbnb_listing_id = @airbnb_listing_id,
        airbnb_ical_url = @airbnb_ical_url,
        airbnb_ical_activo = @airbnb_ical_activo,
        fecha_actualizacion = datetime('now')
    WHERE id = @id
  `).run({
    id,
    codigo_habitacion: String(input.codigo_habitacion ?? current.codigo_habitacion).trim(),
    nombre_habitacion: String(input.nombre_habitacion ?? current.nombre_habitacion).trim(),
    tipo_habitacion: input.tipo_habitacion ?? current.tipo_habitacion,
    descripcion: input.descripcion ?? current.descripcion,
    acomodacion: input.acomodacion ?? current.acomodacion ?? "",
    capacidad: asInteger(input.capacidad ?? current.capacidad, current.capacidad),
    camas: asInteger(input.camas ?? current.camas, current.camas || 0),
    tipo_cama: input.tipo_cama ?? current.tipo_cama ?? "",
    sofa_cama: asInteger(input.sofa_cama ?? current.sofa_cama, current.sofa_cama || 0),
    tipo_vista: input.tipo_vista ?? current.tipo_vista ?? "",
    tina: input.tina ?? current.tina ?? "",
    jacuzzi_interno: input.jacuzzi_interno ?? current.jacuzzi_interno ?? "",
    precio_base_noche: asNumber(input.precio_base_noche ?? current.precio_base_noche, current.precio_base_noche),
    estado: input.estado ?? current.estado,
    color_calendario: input.color_calendario ?? current.color_calendario,
    pendiente_revision: asBoolean(input.pendiente_revision ?? current.pendiente_revision),
    airbnb_listing_id: String(input.airbnb_listing_id ?? current.airbnb_listing_id ?? "").trim(),
    airbnb_ical_url: validateRoomIcalUrl(input.airbnb_ical_url ?? current.airbnb_ical_url),
    airbnb_ical_activo: asBoolean(input.airbnb_ical_activo ?? current.airbnb_ical_activo)
  });
  const room = getRoomById(id);
  mirrorRoomAirbnbFeed(room);
  return room;
}

function hydrateReservation(row) {
  if (!row) return null;
  const rooms = db.prepare(`
    SELECT rr.*, r.codigo_habitacion, r.nombre_habitacion, r.tipo_habitacion, r.capacidad,
           r.precio_base_noche, r.estado, r.color_calendario, r.pendiente_revision
    FROM reservation_rooms rr
    JOIN rooms r ON r.id = rr.habitacion_id
    WHERE rr.reserva_id = ?
  `).all(row.id);
  const payments = db.prepare("SELECT * FROM payments WHERE reserva_id = ? ORDER BY fecha_pago DESC, id DESC").all(row.id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE reserva_id = ? ORDER BY fecha_subida DESC").all(row.id);
  const alerts = db.prepare("SELECT * FROM alerts WHERE reserva_id = ? ORDER BY resuelta ASC, fecha_creacion DESC").all(row.id);
  return {
    ...row,
    airbnb_ok: Boolean(row.airbnb_ok),
    whatsapp_ok: Boolean(row.whatsapp_ok),
    siigo_ok: Boolean(row.siigo_ok),
    queo_ok: Boolean(row.queo_ok),
    total_manual: Boolean(row.total_manual),
    rooms,
    payments,
    attachments,
    alerts
  };
}

function getReservations(filters = {}) {
  const where = [];
  const params = {};

  if (filters.start && filters.end) {
    where.push("date(r.fecha_ingreso) < date(@end) AND date(CASE WHEN r.fecha_salida <= r.fecha_ingreso THEN date(r.fecha_ingreso, '+1 day') ELSE r.fecha_salida END) > date(@start)");
    params.start = filters.start;
    params.end = filters.end;
  }

  if (filters.q) {
    params.q = `%${String(filters.q).trim()}%`;
    where.push(`(
      r.nombre_completo_huesped LIKE @q OR r.cedula LIKE @q OR r.correo LIKE @q OR r.telefono LIKE @q OR
      r.direccion LIKE @q OR r.numero_remision LIKE @q OR r.numero_interno LIKE @q OR
      EXISTS (
        SELECT 1 FROM reservation_rooms rr
        JOIN rooms room ON room.id = rr.habitacion_id
        WHERE rr.reserva_id = r.id AND (room.codigo_habitacion LIKE @q OR room.nombre_habitacion LIKE @q)
      )
    )`);
  }

  if (filters.estado_pago) {
    where.push("r.estado_pago = @estado_pago");
    params.estado_pago = filters.estado_pago;
  }
  if (filters.estado_reserva) {
    where.push("r.estado_reserva = @estado_reserva");
    params.estado_reserva = filters.estado_reserva;
  }
  if (filters.origen_reserva) {
    where.push("r.origen_reserva = @origen_reserva");
    params.origen_reserva = filters.origen_reserva;
  }
  if (filters.saldo_pendiente === "1" || filters.saldo_pendiente === true) {
    where.push("r.saldo > 0");
  }
  if (filters.pagado_total === "1" || filters.pagado_total === true) {
    where.push("r.saldo <= 0 AND r.total_pago > 0");
  }
  if (filters.sin_pago === "1" || filters.sin_pago === true) {
    where.push("r.abono <= 0");
  }
  if (filters.airbnb_ok === "1") where.push("r.airbnb_ok = 1");
  if (filters.whatsapp_ok === "1") where.push("r.whatsapp_ok = 1");
  if (filters.siigo_ok === "1") where.push("r.siigo_ok = 1");
  if (filters.queo_ok === "1") where.push("r.queo_ok = 1");
  if (filters.con_observaciones === "1") where.push("length(trim(coalesce(r.observaciones, ''))) > 0");
  if (filters.con_comprobante === "1") where.push("EXISTS (SELECT 1 FROM attachments a WHERE a.reserva_id = r.id)");
  if (filters.sin_comprobante === "1") where.push("NOT EXISTS (SELECT 1 FROM attachments a WHERE a.reserva_id = r.id)");
  if (filters.con_alertas === "1") where.push("EXISTS (SELECT 1 FROM alerts al WHERE al.reserva_id = r.id AND al.resuelta = 0)");
  if (filters.roomId) {
    where.push("EXISTS (SELECT 1 FROM reservation_rooms rr WHERE rr.reserva_id = r.id AND rr.habitacion_id = @roomId)");
    params.roomId = filters.roomId;
  }

  const sql = `
    SELECT r.*
    FROM reservations r
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY date(r.fecha_ingreso) ASC, r.id DESC
  `;
  return db.prepare(sql).all(params).map(hydrateReservation);
}

function getReservation(id) {
  return hydrateReservation(db.prepare("SELECT * FROM reservations WHERE id = ?").get(id));
}

function reservationDateRules(input) {
  const checkIn = parseDateValue(input.fecha_ingreso);
  const checkOut = parseDateValue(input.fecha_salida);
  if (!checkIn || !checkOut) {
    const error = new Error("Las fechas de ingreso y salida son obligatorias.");
    error.status = 400;
    throw error;
  }
  if (compareDates(checkOut, checkIn) < 0) {
    const error = new Error("La fecha de salida no puede ser menor que la fecha de ingreso.");
    error.status = 400;
    throw error;
  }
  const stayType = input.tipo_estadia || "noche";
  if (compareDates(checkOut, checkIn) === 0 && !["day_use", "manual"].includes(stayType)) {
    const error = new Error("Si ingreso y salida son el mismo dia, usa tipo de estadia day_use o manual.");
    error.status = 400;
    throw error;
  }
  return { checkIn, checkOut, stayType };
}

function validateAvailability(roomIds, checkIn, checkOut, excludeReservationId = null) {
  const occupancyEnd = effectiveCheckOut(checkIn, checkOut);
  const conflicts = [];

  for (const roomId of roomIds) {
    const room = getRoomById(roomId);
    if (!room) {
      conflicts.push({ roomId, type: "room_missing", message: `Habitacion ${roomId} no existe.` });
      continue;
    }
    if (room.estado !== "disponible") {
      conflicts.push({ roomId, type: "room_status", message: `Habitacion ${room.codigo_habitacion} esta ${room.estado}.` });
    }

    const reservationConflict = db.prepare(`
      SELECT r.id, r.nombre_completo_huesped, r.fecha_ingreso, r.fecha_salida
      FROM reservations r
      JOIN reservation_rooms rr ON rr.reserva_id = r.id
      WHERE rr.habitacion_id = @roomId
        AND r.estado_reserva NOT IN ('cancelada')
        AND (@excludeReservationId IS NULL OR r.id != @excludeReservationId)
        AND date(r.fecha_ingreso) < date(@end)
        AND date(CASE WHEN r.fecha_salida <= r.fecha_ingreso THEN date(r.fecha_ingreso, '+1 day') ELSE r.fecha_salida END) > date(@start)
      LIMIT 1
    `).get({ roomId, start: checkIn, end: occupancyEnd, excludeReservationId });

    if (reservationConflict) {
      conflicts.push({
        roomId,
        type: "reservation_overlap",
        message: `Habitacion ${room.codigo_habitacion} cruza con reserva #${reservationConflict.id} (${reservationConflict.nombre_completo_huesped}).`
      });
    }

    const blockConflict = db.prepare(`
      SELECT b.id, b.motivo, b.fecha_inicio, b.fecha_fin
      FROM blocks b
      WHERE b.habitacion_id = @roomId
        AND date(b.fecha_inicio) < date(@end)
        AND date(CASE WHEN b.fecha_fin <= b.fecha_inicio THEN date(b.fecha_inicio, '+1 day') ELSE b.fecha_fin END) > date(@start)
      LIMIT 1
    `).get({ roomId, start: checkIn, end: occupancyEnd });

    if (blockConflict) {
      conflicts.push({
        roomId,
        type: "block_overlap",
        message: `Habitacion ${room.codigo_habitacion} esta bloqueada: ${blockConflict.motivo || "sin motivo"}.`
      });
    }
  }

  if (conflicts.length) {
    const error = new Error("No hay disponibilidad para una o mas habitaciones.");
    error.status = 409;
    error.details = conflicts;
    throw error;
  }
}

function normalizeRoomAssignments(input) {
  const assignments = input.roomAssignments || input.rooms || [];
  if (assignments.length) {
    return assignments.map((assignment) => ({
      habitacion_id: Number(assignment.habitacion_id || assignment.id || assignment.roomId),
      codigo_habitacion_original: assignment.codigo_habitacion_original || assignment.codigo_habitacion || "",
      precio_asignado: asNumber(assignment.precio_asignado ?? assignment.precio_base_noche ?? input.valor_base, null),
      notas: assignment.notas || ""
    })).filter((assignment) => assignment.habitacion_id);
  }
  return (input.roomIds || input.habitacion_ids || []).map((roomId) => {
    const room = getRoomById(Number(roomId));
    return {
      habitacion_id: Number(roomId),
      codigo_habitacion_original: room ? room.codigo_habitacion : "",
      precio_asignado: asNumber(input.valor_base, 0),
      notas: ""
    };
  });
}

function insertRoomAssignments(reservationId, assignments) {
  const insert = db.prepare(`
    INSERT INTO reservation_rooms (reserva_id, habitacion_id, codigo_habitacion_original, precio_asignado, notas)
    VALUES (@reserva_id, @habitacion_id, @codigo_habitacion_original, @precio_asignado, @notas)
  `);
  for (const assignment of assignments) {
    const room = getRoomById(assignment.habitacion_id);
    insert.run({
      reserva_id: reservationId,
      habitacion_id: assignment.habitacion_id,
      codigo_habitacion_original: assignment.codigo_habitacion_original || (room ? room.codigo_habitacion : ""),
      precio_asignado: assignment.precio_asignado,
      notas: assignment.notas || ""
    });
  }
}

function recalculateReservationPayments(reservationId) {
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?").get(reservationId);
  if (!reservation) return null;
  const paid = db.prepare("SELECT COALESCE(SUM(monto), 0) AS total FROM payments WHERE reserva_id = ?").get(reservationId).total || 0;
  const saldo = Math.max(0, Number(reservation.total_pago || 0) - Number(paid || 0));
  const estadoPago = computePaymentStatus(Number(reservation.total_pago || 0), Number(paid || 0));
  db.prepare(`
    UPDATE reservations
    SET abono = ?, saldo = ?, estado_pago = ?, fecha_actualizacion = datetime('now')
    WHERE id = ?
  `).run(paid, saldo, estadoPago, reservationId);
  return getReservation(reservationId);
}

function reservationPayload(input, existing = {}) {
  const { checkIn, checkOut, stayType } = reservationDateRules({ ...existing, ...input });
  const nights = input.noches !== undefined && input.noches !== "" ? asInteger(input.noches, 0) : Math.max(0, diffNights(checkIn, checkOut));
  const valueBase = asNumber(input.valor_base ?? existing.valor_base, 0);
  const computedTotal = nights * valueBase;
  const totalProvided = input.total_pago !== undefined && input.total_pago !== "";
  const total = totalProvided ? asNumber(input.total_pago, 0) : computedTotal;
  const initialPaid = asNumber(input.abono ?? existing.abono, 0);
  const saldo = Math.max(0, total - initialPaid);
  return {
    numero_interno: input.numero_interno ?? existing.numero_interno ?? "",
    numero_remision: input.numero_remision ?? existing.numero_remision ?? "",
    nombre_completo_huesped: String(input.nombre_completo_huesped ?? existing.nombre_completo_huesped ?? "").trim(),
    nombre_huesped: input.nombre_huesped ?? existing.nombre_huesped ?? "",
    apellido_huesped: input.apellido_huesped ?? existing.apellido_huesped ?? "",
    cedula: input.cedula ?? existing.cedula ?? "",
    correo: input.correo ?? existing.correo ?? "",
    telefono: input.telefono ?? existing.telefono ?? "",
    direccion: input.direccion ?? existing.direccion ?? "",
    cantidad_huespedes: asInteger(input.cantidad_huespedes ?? existing.cantidad_huespedes, 1),
    fecha_ingreso: checkIn,
    fecha_salida: checkOut,
    noches: nights,
    tipo_estadia: stayType,
    valor_base: valueBase,
    total_pago: total,
    abono: initialPaid,
    saldo,
    porcentaje_anticipo_sugerido: asNumber(input.porcentaje_anticipo_sugerido ?? existing.porcentaje_anticipo_sugerido, 50),
    fecha_abono: parseDateValue(input.fecha_abono ?? existing.fecha_abono) || "",
    banco_o_medio_pago: input.banco_o_medio_pago ?? existing.banco_o_medio_pago ?? "",
    metodo_pago: input.metodo_pago ?? existing.metodo_pago ?? "transferencia",
    estado_reserva: input.estado_reserva ?? existing.estado_reserva ?? "confirmada",
    estado_pago: input.estado_pago ?? computePaymentStatus(total, initialPaid),
    origen_reserva: normalizeReservationOrigin(input.origen_reserva ?? existing.origen_reserva),
    airbnb_ok: asBoolean(input.airbnb_ok ?? existing.airbnb_ok),
    whatsapp_ok: asBoolean(input.whatsapp_ok ?? existing.whatsapp_ok),
    siigo_ok: asBoolean(input.siigo_ok ?? existing.siigo_ok),
    queo_ok: asBoolean(input.queo_ok ?? existing.queo_ok),
    observaciones: input.observaciones ?? existing.observaciones ?? "",
    total_manual: input.total_manual !== undefined ? asBoolean(input.total_manual) : (totalProvided && Math.abs(total - computedTotal) > 1 ? 1 : asBoolean(existing.total_manual)),
    abono_importado: input.abono_importado ?? existing.abono_importado ?? null,
    saldo_importado: input.saldo_importado ?? existing.saldo_importado ?? null
  };
}

function createReservation(input) {
  const assignments = normalizeRoomAssignments(input);
  if (!assignments.length) {
    const error = new Error("Selecciona al menos una habitacion.");
    error.status = 400;
    throw error;
  }

  const payload = reservationPayload(input);
  if (!payload.nombre_completo_huesped) {
    const error = new Error("El nombre completo del huesped es obligatorio.");
    error.status = 400;
    throw error;
  }

  validateAvailability(assignments.map((item) => item.habitacion_id), payload.fecha_ingreso, payload.fecha_salida);

  const transaction = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO reservations (
        numero_interno, numero_remision, nombre_completo_huesped, nombre_huesped, apellido_huesped,
        cedula, correo, telefono, direccion, cantidad_huespedes, fecha_ingreso, fecha_salida, noches,
        tipo_estadia, valor_base, total_pago, abono, saldo, porcentaje_anticipo_sugerido, fecha_abono,
        banco_o_medio_pago, metodo_pago, estado_reserva, estado_pago, origen_reserva, airbnb_ok,
        whatsapp_ok, siigo_ok, queo_ok, observaciones, total_manual, abono_importado, saldo_importado
      )
      VALUES (
        @numero_interno, @numero_remision, @nombre_completo_huesped, @nombre_huesped, @apellido_huesped,
        @cedula, @correo, @telefono, @direccion, @cantidad_huespedes, @fecha_ingreso, @fecha_salida, @noches,
        @tipo_estadia, @valor_base, @total_pago, @abono, @saldo, @porcentaje_anticipo_sugerido, @fecha_abono,
        @banco_o_medio_pago, @metodo_pago, @estado_reserva, @estado_pago, @origen_reserva, @airbnb_ok,
        @whatsapp_ok, @siigo_ok, @queo_ok, @observaciones, @total_manual, @abono_importado, @saldo_importado
      )
    `).run(payload);

    insertRoomAssignments(info.lastInsertRowid, assignments);

    if (payload.abono > 0) {
      db.prepare(`
        INSERT INTO payments (reserva_id, monto, fecha_pago, metodo_pago, banco_o_medio, referencia_pago, nota)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        info.lastInsertRowid,
        payload.abono,
        payload.fecha_abono || payload.fecha_ingreso,
        payload.metodo_pago,
        payload.banco_o_medio_pago,
        payload.numero_remision || "",
        input.initial_payment_note || "Abono inicial"
      );
    }
    return info.lastInsertRowid;
  });

  const id = transaction();
  return recalculateReservationPayments(id);
}

function updateReservation(id, input) {
  const existing = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id);
  if (!existing) return null;
  const payload = reservationPayload(input, existing);
  const assignments = normalizeRoomAssignments(input).length ? normalizeRoomAssignments(input) : db.prepare(`
    SELECT habitacion_id, codigo_habitacion_original, precio_asignado, notas
    FROM reservation_rooms WHERE reserva_id = ?
  `).all(id);

  validateAvailability(assignments.map((item) => item.habitacion_id), payload.fecha_ingreso, payload.fecha_salida, id);

  const transaction = db.transaction(() => {
    const updatePayload = {
      id,
      numero_interno: payload.numero_interno,
      numero_remision: payload.numero_remision,
      nombre_completo_huesped: payload.nombre_completo_huesped,
      nombre_huesped: payload.nombre_huesped,
      apellido_huesped: payload.apellido_huesped,
      cedula: payload.cedula,
      correo: payload.correo,
      telefono: payload.telefono,
      direccion: payload.direccion,
      cantidad_huespedes: payload.cantidad_huespedes,
      fecha_ingreso: payload.fecha_ingreso,
      fecha_salida: payload.fecha_salida,
      noches: payload.noches,
      tipo_estadia: payload.tipo_estadia,
      valor_base: payload.valor_base,
      total_pago: payload.total_pago,
      porcentaje_anticipo_sugerido: payload.porcentaje_anticipo_sugerido,
      fecha_abono: payload.fecha_abono,
      banco_o_medio_pago: payload.banco_o_medio_pago,
      metodo_pago: payload.metodo_pago,
      estado_reserva: payload.estado_reserva,
      origen_reserva: payload.origen_reserva,
      airbnb_ok: payload.airbnb_ok,
      whatsapp_ok: payload.whatsapp_ok,
      siigo_ok: payload.siigo_ok,
      queo_ok: payload.queo_ok,
      observaciones: payload.observaciones,
      total_manual: payload.total_manual,
      abono_importado: payload.abono_importado,
      saldo_importado: payload.saldo_importado
    };

    db.prepare(`
      UPDATE reservations
      SET numero_interno = @numero_interno,
          numero_remision = @numero_remision,
          nombre_completo_huesped = @nombre_completo_huesped,
          nombre_huesped = @nombre_huesped,
          apellido_huesped = @apellido_huesped,
          cedula = @cedula,
          correo = @correo,
          telefono = @telefono,
          direccion = @direccion,
          cantidad_huespedes = @cantidad_huespedes,
          fecha_ingreso = @fecha_ingreso,
          fecha_salida = @fecha_salida,
          noches = @noches,
          tipo_estadia = @tipo_estadia,
          valor_base = @valor_base,
          total_pago = @total_pago,
          porcentaje_anticipo_sugerido = @porcentaje_anticipo_sugerido,
          fecha_abono = @fecha_abono,
          banco_o_medio_pago = @banco_o_medio_pago,
          metodo_pago = @metodo_pago,
          estado_reserva = @estado_reserva,
          origen_reserva = @origen_reserva,
          airbnb_ok = @airbnb_ok,
          whatsapp_ok = @whatsapp_ok,
          siigo_ok = @siigo_ok,
          queo_ok = @queo_ok,
          observaciones = @observaciones,
          total_manual = @total_manual,
          abono_importado = @abono_importado,
          saldo_importado = @saldo_importado,
          fecha_actualizacion = datetime('now')
      WHERE id = @id
    `).run(updatePayload);

    if (input.roomAssignments || input.rooms || input.roomIds || input.habitacion_ids) {
      db.prepare("DELETE FROM reservation_rooms WHERE reserva_id = ?").run(id);
      insertRoomAssignments(id, assignments);
    }
  });

  transaction();
  return recalculateReservationPayments(id);
}

function deleteReservation(id) {
  const reservation = getReservation(id);
  if (!reservation) return false;
  db.prepare("DELETE FROM reservations WHERE id = ?").run(id);
  return true;
}

function addPayment(reservationId, input) {
  const reservation = getReservation(reservationId);
  if (!reservation) return null;
  const info = db.prepare(`
    INSERT INTO payments (reserva_id, monto, fecha_pago, metodo_pago, banco_o_medio, referencia_pago, nota)
    VALUES (@reserva_id, @monto, @fecha_pago, @metodo_pago, @banco_o_medio, @referencia_pago, @nota)
  `).run({
    reserva_id: reservationId,
    monto: asNumber(input.monto, 0),
    fecha_pago: parseDateValue(input.fecha_pago) || new Date().toISOString().slice(0, 10),
    metodo_pago: input.metodo_pago || reservation.metodo_pago || "transferencia",
    banco_o_medio: input.banco_o_medio || input.banco_o_medio_pago || reservation.banco_o_medio_pago || "",
    referencia_pago: input.referencia_pago || "",
    nota: input.nota || ""
  });
  recalculateReservationPayments(reservationId);
  return db.prepare("SELECT * FROM payments WHERE id = ?").get(info.lastInsertRowid);
}

function updatePayment(id, input) {
  const current = db.prepare("SELECT * FROM payments WHERE id = ?").get(id);
  if (!current) return null;
  db.prepare(`
    UPDATE payments
    SET monto = @monto,
        fecha_pago = @fecha_pago,
        metodo_pago = @metodo_pago,
        banco_o_medio = @banco_o_medio,
        referencia_pago = @referencia_pago,
        nota = @nota
    WHERE id = @id
  `).run({
    id,
    monto: asNumber(input.monto ?? current.monto, current.monto),
    fecha_pago: parseDateValue(input.fecha_pago ?? current.fecha_pago) || current.fecha_pago,
    metodo_pago: input.metodo_pago ?? current.metodo_pago,
    banco_o_medio: input.banco_o_medio ?? current.banco_o_medio,
    referencia_pago: input.referencia_pago ?? current.referencia_pago,
    nota: input.nota ?? current.nota
  });
  recalculateReservationPayments(current.reserva_id);
  return db.prepare("SELECT * FROM payments WHERE id = ?").get(id);
}

function deletePayment(id) {
  const current = db.prepare("SELECT * FROM payments WHERE id = ?").get(id);
  if (!current) return false;
  db.prepare("DELETE FROM payments WHERE id = ?").run(id);
  recalculateReservationPayments(current.reserva_id);
  return true;
}

function availability({ checkIn, checkOut, guests = 1, type = "" }) {
  const start = parseDateValue(checkIn);
  const end = parseDateValue(checkOut);
  if (!start || !end || compareDates(end, start) < 0) {
    const error = new Error("Rango de fechas invalido.");
    error.status = 400;
    throw error;
  }
  const rooms = db.prepare(`
    SELECT * FROM rooms
    WHERE estado = 'disponible'
      AND capacidad >= @guests
      AND (@type = '' OR lower(tipo_habitacion) LIKE lower(@typeLike))
  `).all({ guests: asInteger(guests, 1), type, typeLike: `%${type}%` });

  const nights = Math.max(1, diffNights(start, end));
  return sortRooms(rooms).map((room) => {
    try {
      validateAvailability([room.id], start, end);
      return { ...room, disponible: true, total_calculado: nights * Number(room.precio_base_noche || 0) };
    } catch (error) {
      return { ...room, disponible: false, total_calculado: nights * Number(room.precio_base_noche || 0), motivo: error.details?.[0]?.message || error.message };
    }
  }).filter((room) => room.disponible);
}

module.exports = {
  addPayment,
  asBoolean,
  asInteger,
  asNumber,
  availability,
  createReservation,
  createRoom,
  deletePayment,
  deleteReservation,
  getReservation,
  getReservations,
  getRoomByCode,
  getRoomById,
  mirrorRoomAirbnbFeed,
  recalculateReservationPayments,
  updatePayment,
  updateReservation,
  updateRoom,
  validateAvailability,
  validateRoomIcalUrl
};
