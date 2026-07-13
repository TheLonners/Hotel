const { DatabaseSync } = require("node:sqlite");

const dbPath = "C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const reservationColumns = db.prepare("PRAGMA table_info(reservations)").all();
const reservations = db.prepare(`
  SELECT id, numero_interno, numero_remision, nombre_completo_huesped, nombre_huesped,
         apellido_huesped, fecha_ingreso, fecha_salida, origen_reserva, airbnb_ok, observaciones
  FROM reservations
  ORDER BY id
`).all();
const airbnbReservations = reservations.filter((row) => String(row.origen_reserva || "").toLowerCase() === "airbnb");
const codes = db.prepare(`
  SELECT id, numero_remision, observaciones, nombre_completo_huesped, nombre_huesped,
         fecha_ingreso, fecha_salida, origen_reserva
  FROM reservations
  WHERE lower(coalesce(origen_reserva,'')) = 'airbnb'
     OR upper(coalesce(numero_remision,'')) LIKE 'HM%'
     OR upper(coalesce(observaciones,'')) LIKE '%HM%'
  ORDER BY id
`).all();
console.log(JSON.stringify({
  dbPath,
  tables: tables.map((row) => row.name),
  reservationColumns,
  reservationCount: reservations.length,
  airbnbReservationCount: airbnbReservations.length,
  reservations: codes
}, null, 2));
db.close();
