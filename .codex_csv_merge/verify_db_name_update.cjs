const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dbPath = "C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite";
const backupPath = "C:/Users/Nick-Victus/Documents/Hotel/backups/hotel_manual_2026-07-12T13-41-53-972Z/hotel.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });
const backup = new DatabaseSync(backupPath, { readOnly: true });

const result = {
  mainIntegrity: db.prepare("PRAGMA integrity_check").get().integrity_check,
  mainForeignKeys: db.prepare("PRAGMA foreign_key_check").all(),
  backupExists: fs.existsSync(backupPath),
  backupIntegrity: backup.prepare("PRAGMA integrity_check").get().integrity_check,
  totalAirbnb: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE origen_reserva='airbnb'").get().n,
  namedAirbnb: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE origen_reserva='airbnb' AND nombre_completo_huesped NOT LIKE 'Airbnb HM%'").get().n,
  remainingPlaceholders: db.prepare("SELECT id, numero_remision, nombre_completo_huesped FROM reservations WHERE origen_reserva='airbnb' AND nombre_completo_huesped LIKE 'Airbnb HM%' ORDER BY id").all(),
  changedSample: db.prepare("SELECT id, numero_remision, nombre_completo_huesped, fecha_ingreso, fecha_salida, total_pago, abono, saldo FROM reservations WHERE id IN (10, 17, 21, 28) ORDER BY id").all()
};
console.log(JSON.stringify(result, null, 2));
db.close();
backup.close();
