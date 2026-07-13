const fs = require("fs");
const XLSX = require("C:/Users/Nick-Victus/Documents/Hotel/backend/node_modules/xlsx");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite", { readOnly: true });
const csvPath = "C:/Users/Nick-Victus/Downloads/airbnb_01_2026-07_2026 (1).csv";
const workbook = XLSX.read(fs.readFileSync(csvPath), { type: "buffer", raw: true });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true });

function norm(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function value(row, aliases) {
  const wanted = new Set(aliases.map(norm));
  const key = Object.keys(row).find((name) => wanted.has(norm(name)));
  return key ? String(row[key] ?? "").trim().replace(/\s+/g, " ") : "";
}
function code(valueText) { return (String(valueText || "").toUpperCase().match(/\bHM[A-Z0-9]{6,}\b/) || [""])[0]; }

const dbRows = db.prepare("SELECT id, numero_remision, nombre_completo_huesped FROM reservations WHERE origen_reserva='airbnb'").all();
const byCode = new Map(dbRows.map((row) => [code(row.numero_remision), row]));
const matches = [];
for (const [index, row] of rows.entries()) {
  const type = norm(value(row, ["Tipo", "Type"]));
  if (type !== "reservacion" && type !== "reservation") continue;
  const id = code(value(row, ["Código de confirmación", "Confirmation code"]));
  const name = value(row, ["Huésped", "Guest"]);
  const reservation = byCode.get(id);
  if (reservation && name) matches.push({ rowNumber: index + 2, code: id, name, reservationId: reservation.id, before: reservation.nombre_completo_huesped });
}
console.log(JSON.stringify({ csvRows: rows.length, reservationRows: matches.length, matches }, null, 2));
db.close();
