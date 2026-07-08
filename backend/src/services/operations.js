const { db } = require("../database/db");
const { addDays, diffNights, effectiveCheckOut, toISODate } = require("./dates");
const { getReservations } = require("./reservations");
const { sortRooms } = require("./roomOrdering");

const CLEANING_STATES = ["sin limpiar", "por limpiar", "limpiando", "limpio"];

function roomCodes(reservation) {
  return reservation.rooms.map((room) => room.codigo_habitacion).join(" Y ");
}

function channelLabel(value) {
  return value === "airbnb" ? "Airbnb" : "WhatsApp";
}

function reservationRows(reservations, category, priority) {
  return reservations.flatMap((reservation) =>
    reservation.rooms.map((room) => ({
      id: `${category}-${reservation.id}-${room.habitacion_id}`,
      reserva_id: reservation.id,
      habitacion_id: room.habitacion_id,
      habitacion: room.codigo_habitacion,
      huesped: reservation.nombre_completo_huesped,
      telefono: reservation.telefono || "",
      canal: channelLabel(reservation.origen_reserva),
      ingreso: reservation.fecha_ingreso,
      salida: reservation.fecha_salida,
      prioridad: priority,
      categoria: category,
      remision: reservation.numero_remision || ""
    }))
  );
}

function getTodayOperations(date = toISODate(new Date())) {
  const tomorrow = addDays(date, 1);
  const windowEnd = addDays(date, 3);
  const reservations = getReservations({ start: addDays(date, -10), end: windowEnd })
    .filter((reservation) => reservation.estado_reserva !== "cancelada");

  const checkinsToday = reservations.filter((reservation) => reservation.fecha_ingreso === date);
  const checkinsTomorrow = reservations.filter((reservation) => reservation.fecha_ingreso === tomorrow);
  const inHouse = reservations.filter((reservation) =>
    reservation.fecha_ingreso <= date && effectiveCheckOut(reservation.fecha_ingreso, reservation.fecha_salida) > date
  );
  const checkoutsToday = reservations.filter((reservation) => reservation.fecha_salida === date);
  const secondDayCleaning = reservations.filter((reservation) =>
    Number(reservation.noches || diffNights(reservation.fecha_ingreso, reservation.fecha_salida)) > 2 &&
    addDays(reservation.fecha_ingreso, 2) === date
  );

  const checkoutRoomIds = new Map();
  checkoutsToday.forEach((reservation) => {
    reservation.rooms.forEach((room) => checkoutRoomIds.set(room.habitacion_id, reservation));
  });
  const urgent = checkinsToday.flatMap((reservation) =>
    reservation.rooms
      .filter((room) => checkoutRoomIds.has(room.habitacion_id))
      .map((room) => {
        const checkout = checkoutRoomIds.get(room.habitacion_id);
        return {
          id: `urgent-${reservation.id}-${room.habitacion_id}`,
          reserva_id: reservation.id,
          habitacion_id: room.habitacion_id,
          habitacion: room.codigo_habitacion,
          huesped: reservation.nombre_completo_huesped,
          telefono: reservation.telefono || "",
          canal: channelLabel(reservation.origen_reserva),
          ingreso: reservation.fecha_ingreso,
          salida: reservation.fecha_salida,
          prioridad: "urgente",
          categoria: "urgentes",
          remision: reservation.numero_remision || "",
          detalle: `Sale ${checkout.nombre_completo_huesped} y entra ${reservation.nombre_completo_huesped}`
        };
      })
  );

  return {
    date,
    tomorrow,
    checkins_today: reservationRows(checkinsToday, "ingresan_hoy", "alta"),
    checkins_tomorrow: reservationRows(checkinsTomorrow, "ingresan_manana", "media"),
    in_house: reservationRows(inHouse, "hospedados", "normal"),
    checkouts_today: reservationRows(checkoutsToday, "salen_hoy", "alta"),
    second_day_cleaning: reservationRows(secondDayCleaning, "aseo_segundo_dia", "media"),
    urgent_turnovers: urgent
  };
}

function ensureCleaningForDate(date = toISODate(new Date())) {
  const ops = getTodayOperations(date);
  const urgentRoomIds = new Set(ops.urgent_turnovers.map((row) => row.habitacion_id));
  const checkoutRows = ops.checkouts_today;

  const upsert = db.prepare(`
    INSERT INTO room_cleaning_status (habitacion_id, estado, fecha_estado, prioridad, notas, fecha_actualizacion)
    VALUES (@habitacion_id, @estado, @fecha_estado, @prioridad, @notas, datetime('now'))
    ON CONFLICT(habitacion_id) DO UPDATE SET
      estado = CASE
        WHEN room_cleaning_status.estado = 'limpio' AND room_cleaning_status.fecha_estado = excluded.fecha_estado THEN room_cleaning_status.estado
        ELSE excluded.estado
      END,
      fecha_estado = excluded.fecha_estado,
      prioridad = excluded.prioridad,
      notas = CASE
        WHEN room_cleaning_status.estado = 'limpio' AND room_cleaning_status.fecha_estado = excluded.fecha_estado THEN room_cleaning_status.notas
        ELSE excluded.notas
      END,
      fecha_actualizacion = datetime('now')
  `);

  const insertHistory = db.prepare(`
    INSERT INTO room_cleaning_history (habitacion_id, fecha, estado, prioridad, notas)
    SELECT @habitacion_id, @fecha, @estado, @prioridad, @notas
    WHERE NOT EXISTS (
      SELECT 1 FROM room_cleaning_history
      WHERE habitacion_id = @habitacion_id AND fecha = @fecha AND estado = @estado AND prioridad = @prioridad
    )
  `);

  checkoutRows.forEach((row) => {
    const priority = urgentRoomIds.has(row.habitacion_id) ? "urgente" : "salida";
    const notes = priority === "urgente"
      ? "Salida y entrada el mismo dia. Prioridad alta."
      : "Salida programada hoy.";
    const payload = {
      habitacion_id: row.habitacion_id,
      estado: "por limpiar",
      fecha_estado: date,
      prioridad: priority,
      notas: notes
    };
    upsert.run(payload);
    insertHistory.run({
      habitacion_id: payload.habitacion_id,
      fecha: date,
      estado: payload.estado,
      prioridad: payload.prioridad,
      notas: payload.notas
    });
  });
}

function listCleaning(date = toISODate(new Date())) {
  ensureCleaningForDate(date);
  const rooms = sortRooms(db.prepare("SELECT * FROM rooms").all());
  const statusRows = db.prepare("SELECT * FROM room_cleaning_status").all();
  const statusByRoom = new Map(statusRows.map((row) => [row.habitacion_id, row]));
  const history = db.prepare(`
    SELECT h.*, r.codigo_habitacion, r.nombre_habitacion
    FROM room_cleaning_history h
    JOIN rooms r ON r.id = h.habitacion_id
    WHERE h.fecha = ?
    ORDER BY r.codigo_habitacion, h.fecha_creacion DESC
  `).all(date);
  const ops = getTodayOperations(date);
  const urgentRoomIds = new Set(ops.urgent_turnovers.map((row) => row.habitacion_id));

  return {
    date,
    rooms: rooms.map((room) => {
      const status = statusByRoom.get(room.id);
      return {
        habitacion_id: room.id,
        codigo_habitacion: room.codigo_habitacion,
        nombre_habitacion: room.nombre_habitacion,
        estado: status?.estado || "sin limpiar",
        fecha_estado: status?.fecha_estado || "",
        prioridad: urgentRoomIds.has(room.id) ? "urgente" : (status?.prioridad || ""),
        notas: status?.notas || "",
        fecha_actualizacion: status?.fecha_actualizacion || ""
      };
    }),
    history
  };
}

function setCleaningStatus(roomId, input) {
  const state = CLEANING_STATES.includes(input.estado) ? input.estado : "sin limpiar";
  const date = input.fecha || toISODate(new Date());
  const priority = input.prioridad || "";
  const notes = input.notas || "";
  db.prepare(`
    INSERT INTO room_cleaning_status (habitacion_id, estado, fecha_estado, prioridad, notas, fecha_actualizacion)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(habitacion_id) DO UPDATE SET
      estado = excluded.estado,
      fecha_estado = excluded.fecha_estado,
      prioridad = excluded.prioridad,
      notas = excluded.notas,
      fecha_actualizacion = datetime('now')
  `).run(roomId, state, date, priority, notes);
  db.prepare(`
    INSERT INTO room_cleaning_history (habitacion_id, fecha, estado, prioridad, notas)
    VALUES (?, ?, ?, ?, ?)
  `).run(roomId, date, state, priority, notes);
  return listCleaning(date).rooms.find((room) => room.habitacion_id === roomId);
}

function cleaningCsv(date = toISODate(new Date())) {
  const report = listCleaning(date);
  const headers = ["habitacion", "nombre_habitacion", "estado", "prioridad", "fecha", "notas", "actualizado"];
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = report.rooms.map((room) => [
    room.codigo_habitacion,
    room.nombre_habitacion,
    room.estado,
    room.prioridad,
    room.fecha_estado || date,
    room.notas,
    room.fecha_actualizacion
  ]);
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

module.exports = {
  CLEANING_STATES,
  cleaningCsv,
  getTodayOperations,
  listCleaning,
  setCleaningStatus
};
