const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hotel-reservation-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "hotel.sqlite");

const { db } = require("../database/db");
const { addPayment, createReservation, createRoom } = require("../services/reservations");

try {
  const room = createRoom({ codigo_habitacion: "TEST-01", nombre_habitacion: "Habitacion de prueba", capacidad: 2, estado: "disponible" });
  const reservation = createReservation({
    roomIds: [room.id],
    nombre_completo_huesped: "Huesped de prueba",
    fecha_ingreso: "2030-01-10",
    fecha_salida: "2030-01-12",
    cantidad_huespedes: 1,
    valor_base: 100000,
    total_pago: 200000,
    abono: 50000,
    origen_reserva: "whatsapp"
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reservations").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reservation_guests WHERE reservation_id = ? AND is_primary_guest = 1").get(reservation.id).count, 1);

  const beforeRejectedRequests = db.prepare("SELECT COUNT(*) AS count FROM reservations").get().count;
  assert.throws(() => createReservation({
    roomIds: [room.id], nombre_completo_huesped: "Dato invalido", fecha_ingreso: "2030-02-01", fecha_salida: "2030-02-02",
    cantidad_huespedes: -1, total_pago: 100, abono: 0
  }), /cantidad de huespedes/);
  assert.throws(() => createReservation({
    roomIds: [room.id], nombre_completo_huesped: "Pago invalido", fecha_ingreso: "2030-02-03", fecha_salida: "2030-02-04",
    cantidad_huespedes: 1, total_pago: 100, abono: 101
  }), /abono/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reservations").get().count, beforeRejectedRequests);
  const beforeRejectedPayments = db.prepare("SELECT COUNT(*) AS count FROM payments WHERE reserva_id = ?").get(reservation.id).count;
  assert.throws(() => addPayment(reservation.id, { monto: -1 }), /mayor que cero/);
  assert.throws(() => addPayment(reservation.id, { monto: 150001 }), /supera el total/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payments WHERE reserva_id = ?").get(reservation.id).count, beforeRejectedPayments);

  const airbnbRoom = createRoom({ codigo_habitacion: "TEST-AIRBNB", nombre_habitacion: "Habitacion Airbnb", capacidad: 2, estado: "disponible" });
  db.prepare(`
    INSERT INTO blocks (habitacion_id, fecha_inicio, fecha_fin, motivo, origen_bloqueo, tipo_bloqueo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(airbnbRoom.id, "2030-03-01", "2030-03-02", "Airbnb no disponible", "airbnb", "airbnb");
  const directOverAirbnbBlock = createReservation({
    roomIds: [airbnbRoom.id],
    nombre_completo_huesped: "Reserva directa sobre Airbnb bloqueado",
    fecha_ingreso: "2030-03-01",
    fecha_salida: "2030-03-02",
    cantidad_huespedes: 1,
    valor_base: 100000,
    origen_reserva: "whatsapp"
  });
  assert.equal(directOverAirbnbBlock.rooms[0].habitacion_id, airbnbRoom.id);

  const manualRoom = createRoom({ codigo_habitacion: "TEST-MANUAL", nombre_habitacion: "Habitacion manual", capacidad: 2, estado: "disponible" });
  db.prepare(`
    INSERT INTO blocks (habitacion_id, fecha_inicio, fecha_fin, motivo, origen_bloqueo, tipo_bloqueo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(manualRoom.id, "2030-04-01", "2030-04-02", "Mantenimiento", "manual", "manual");
  assert.throws(() => createReservation({
    roomIds: [manualRoom.id],
    nombre_completo_huesped: "Reserva sobre mantenimiento",
    fecha_ingreso: "2030-04-01",
    fecha_salida: "2030-04-02",
    cantidad_huespedes: 1,
    valor_base: 100000,
    origen_reserva: "whatsapp"
  }), /No hay disponibilidad/);

  console.log("PASS: reservation integrity checks");
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
