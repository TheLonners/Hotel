const { db } = require("./db");
const { createReservation, createRoom } = require("../services/reservations");

const count = db.prepare("SELECT COUNT(*) AS total FROM rooms").get().total;
if (count > 0) {
  console.log("Seed omitido: ya existen habitaciones.");
  process.exit(0);
}

const rooms = [
  { codigo_habitacion: "1", nombre_habitacion: "Habitacion 1", tipo_habitacion: "Doble", capacidad: 2, precio_base_noche: 230000, color_calendario: "#4f9da6" },
  { codigo_habitacion: "3", nombre_habitacion: "Habitacion 3", tipo_habitacion: "Doble", capacidad: 2, precio_base_noche: 230000, color_calendario: "#78a76d" },
  { codigo_habitacion: "D4", nombre_habitacion: "D4 Suite", tipo_habitacion: "Suite", capacidad: 4, precio_base_noche: 360000, color_calendario: "#6c8ebf" },
  { codigo_habitacion: "F3", nombre_habitacion: "F3 Familiar", tipo_habitacion: "Familiar", capacidad: 5, precio_base_noche: 420000, color_calendario: "#c58b57" },
  { codigo_habitacion: "Penthouse", nombre_habitacion: "Penthouse", tipo_habitacion: "Penthouse", capacidad: 6, precio_base_noche: 650000, color_calendario: "#9a7bb8" }
].map(createRoom);

createReservation({
  nombre_completo_huesped: "Sebastian Rivera",
  cedula: "10101010",
  correo: "sebastian@example.com",
  telefono: "3001234567",
  direccion: "Bogota",
  cantidad_huespedes: 2,
  fecha_ingreso: "2026-07-05",
  fecha_salida: "2026-07-08",
  valor_base: 230000,
  total_pago: 690000,
  abono: 350000,
  fecha_abono: "2026-07-01",
  banco_o_medio_pago: "Bancolombia",
  metodo_pago: "bancolombia",
  numero_remision: "REM-001",
  estado_reserva: "confirmada",
  origen_reserva: "whatsapp",
  whatsapp_ok: true,
  observaciones: "Reserva de ejemplo",
  roomIds: [rooms[0].id]
});

createReservation({
  nombre_completo_huesped: "Daniela Sofia Gomez",
  cantidad_huespedes: 4,
  fecha_ingreso: "2026-07-10",
  fecha_salida: "2026-07-13",
  valor_base: 360000,
  total_pago: 1080000,
  abono: 1080000,
  banco_o_medio_pago: "Nequi",
  metodo_pago: "nequi",
  numero_remision: "REM-002",
  estado_reserva: "confirmada",
  estado_pago: "pagado_total",
  airbnb_ok: true,
  roomIds: [rooms[2].id, rooms[3].id]
});

db.prepare(`
  INSERT INTO blocks (habitacion_id, fecha_inicio, fecha_fin, motivo, notas)
  VALUES (?, '2026-07-15', '2026-07-17', 'Mantenimiento', 'Pintura y revision')
`).run(rooms[1].id);

console.log("Seed creado con habitaciones, reservas y un bloqueo de ejemplo.");
