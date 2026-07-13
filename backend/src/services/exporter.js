const { getReservations, splitGuestName } = require("./reservations");
const { db } = require("../database/db");
const { sortRooms } = require("./roomOrdering");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function maskIcalUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}/…/${url.pathname.split("/").filter(Boolean).slice(-1)[0] || "calendar.ics"}`;
  } catch (_error) {
    return "Integración configurada";
  }
}

function makeCsv(headers, rows) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function roomCodes(reservation) {
  return reservation.rooms.map((room) => room.codigo_habitacion || room.codigo_habitacion_original).join(" Y ");
}

function exportReservationsExcel(filters = {}) {
  const reservations = getReservations(filters);
  const headers = [
    "#",
    "NOMBRE",
    "primer_nombre",
    "segundo_nombre",
    "primer_apellido",
    "segundo_apellido",
    "email",
    "Teléfono",
    "CC",
    "Direccion",
    "Huéspedes",
    "Habitación",
    "FECHA INGRESO",
    "Fecha Salida",
    "VALOR",
    "TOTAL",
    "ABONO",
    "SALDO",
    "FECHA ABONO",
    "BANCO",
    "Noches",
    "N° REMISION",
    "AIRBNB",
    "WHAT",
    "SIIGO",
    "QUEO",
    "OBSERVACIONES"
  ];
  const rows = reservations.map((reservation) => {
    const name = splitGuestName(reservation.nombre_completo_huesped, reservation.nombre_huesped, reservation.apellido_huesped);
    return ({
    "#": reservation.numero_interno || reservation.id,
    "NOMBRE": reservation.nombre_completo_huesped,
    primer_nombre: name.primer_nombre,
    segundo_nombre: name.segundo_nombre,
    primer_apellido: name.primer_apellido,
    segundo_apellido: name.segundo_apellido,
    "email": reservation.correo,
    "Teléfono": reservation.telefono,
    "CC": reservation.cedula,
    "Direccion": reservation.direccion,
    "Huéspedes": reservation.cantidad_huespedes,
    "Habitación": roomCodes(reservation),
    "FECHA INGRESO": reservation.fecha_ingreso,
    "Fecha Salida": reservation.fecha_salida,
    "VALOR": reservation.valor_base,
    "TOTAL": reservation.total_pago,
    "ABONO": reservation.abono,
    "SALDO": reservation.saldo,
    "FECHA ABONO": reservation.fecha_abono,
    "BANCO": reservation.banco_o_medio_pago,
    "Noches": reservation.noches,
    "N° REMISION": reservation.numero_remision,
    "AIRBNB": reservation.airbnb_ok ? "SI" : "",
    "WHAT": reservation.whatsapp_ok ? "SI" : "",
    "SIIGO": reservation.siigo_ok ? "SI" : "",
    "QUEO": reservation.queo_ok ? "SI" : "",
    "OBSERVACIONES": reservation.observaciones
    });
  });
  return makeCsv(headers, rows);
}

function exportReservationsNormalized(filters = {}) {
  const reservations = getReservations(filters);
  const headers = [
    "id_reserva",
    "numero_remision",
    "nombre_completo_huesped",
    "primer_nombre",
    "segundo_nombre",
    "primer_apellido",
    "segundo_apellido",
    "cedula",
    "correo",
    "telefono",
    "direccion",
    "cantidad_huespedes",
    "habitaciones",
    "fecha_ingreso",
    "fecha_salida",
    "noches",
    "valor_base",
    "total_pago",
    "total_abonos",
    "saldo",
    "estado_pago",
    "estado_reserva",
    "banco_o_medio_pago",
    "metodo_pago",
    "origen_reserva",
    "airbnb_ok",
    "whatsapp_ok",
    "siigo_ok",
    "queo_ok",
    "observaciones",
    "cantidad_comprobantes",
    "fecha_creacion"
  ];
  const rows = reservations.map((reservation) => {
    const name = splitGuestName(reservation.nombre_completo_huesped, reservation.nombre_huesped, reservation.apellido_huesped);
    return ({
    id_reserva: reservation.id,
    numero_remision: reservation.numero_remision,
    nombre_completo_huesped: reservation.nombre_completo_huesped,
    primer_nombre: name.primer_nombre,
    segundo_nombre: name.segundo_nombre,
    primer_apellido: name.primer_apellido,
    segundo_apellido: name.segundo_apellido,
    cedula: reservation.cedula,
    correo: reservation.correo,
    telefono: reservation.telefono,
    direccion: reservation.direccion,
    cantidad_huespedes: reservation.cantidad_huespedes,
    habitaciones: roomCodes(reservation),
    fecha_ingreso: reservation.fecha_ingreso,
    fecha_salida: reservation.fecha_salida,
    noches: reservation.noches,
    valor_base: reservation.valor_base,
    total_pago: reservation.total_pago,
    total_abonos: reservation.abono,
    saldo: reservation.saldo,
    estado_pago: reservation.estado_pago,
    estado_reserva: reservation.estado_reserva,
    banco_o_medio_pago: reservation.banco_o_medio_pago,
    metodo_pago: reservation.metodo_pago,
    origen_reserva: reservation.origen_reserva,
    airbnb_ok: reservation.airbnb_ok ? "1" : "0",
    whatsapp_ok: reservation.whatsapp_ok ? "1" : "0",
    siigo_ok: reservation.siigo_ok ? "1" : "0",
    queo_ok: reservation.queo_ok ? "1" : "0",
    observaciones: reservation.observaciones,
    cantidad_comprobantes: reservation.attachments.length,
    fecha_creacion: reservation.fecha_creacion
    });
  });
  return makeCsv(headers, rows);
}

function exportRooms() {
  const rows = sortRooms(db.prepare("SELECT * FROM rooms").all());
  const headers = [
    "id",
    "codigo_habitacion",
    "nombre_habitacion",
    "tipo_habitacion",
    "descripcion",
    "acomodacion",
    "capacidad",
    "camas",
    "tipo_cama",
    "sofa_cama",
    "tipo_vista",
    "tina",
    "jacuzzi_interno",
    "precio_base_noche",
    "estado",
    "color_calendario",
    "foto_url",
    "airbnb_listing_id",
    "airbnb_ical_url_protegida",
    "airbnb_ical_activo",
    "pendiente_revision",
    "fecha_creacion",
    "fecha_actualizacion"
  ];
  return makeCsv(headers, rows.map((room) => ({ ...room, airbnb_ical_url_protegida: maskIcalUrl(room.airbnb_ical_url) })));
}

function exportPayments() {
  const rows = db.prepare(`
    SELECT p.*, r.numero_remision, r.nombre_completo_huesped
    FROM payments p
    JOIN reservations r ON r.id = p.reserva_id
    ORDER BY p.fecha_pago DESC, p.id DESC
  `).all();
  const headers = ["id", "reserva_id", "numero_remision", "nombre_completo_huesped", "monto", "fecha_pago", "metodo_pago", "banco_o_medio", "referencia_pago", "nota", "fecha_creacion"];
  return makeCsv(headers, rows);
}

function exportBalances(filters = {}) {
  return exportReservationsNormalized({ ...filters, saldo_pendiente: "1" });
}

module.exports = {
  exportBalances,
  exportPayments,
  exportReservationsExcel,
  exportReservationsNormalized,
  exportRooms,
  makeCsv
};
