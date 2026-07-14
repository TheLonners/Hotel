const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite", { readOnly: true });
const rows = db.prepare("SELECT id, numero_remision, nombre_completo_huesped, observaciones FROM reservations WHERE origen_reserva='airbnb' ORDER BY id").all();
console.log(JSON.stringify(rows.filter((row) => !String(row.numero_remision || "").match(/HM[A-Z0-9]{6,}/i)), null, 2));
db.close();
