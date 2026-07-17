const fs = require("fs");
const path = require("path");
const XLSX = require("C:/Users/Nick-Victus/Documents/Hotel/backend/node_modules/xlsx");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite", { readOnly: true });
const csvPath = "C:/Users/Nick-Victus/Downloads/airbnb_pending (2).csv";
const workbook = XLSX.read(fs.readFileSync(csvPath), { type: "buffer", raw: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function value(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const key = Object.keys(row).find((name) => wanted.has(normalizeHeader(name)));
  return key ? String(row[key] ?? "").trim() : "";
}
function codeFrom(valueText) {
  const text = String(valueText || "").toUpperCase();
  return (text.match(/\bHM[A-Z0-9]{6,}\b/) || [""])[0];
}

const dbRows = db.prepare(`
  SELECT id, numero_remision, nombre_completo_huesped, nombre_huesped, apellido_huesped,
         fecha_ingreso, fecha_salida, total_pago, abono, saldo
  FROM reservations
  WHERE origen_reserva = 'airbnb'
`).all();
const byCode = new Map();
for (const row of dbRows) {
  const code = codeFrom(row.numero_remision);
  if (code) byCode.set(code, row);
}

const matches = [];
const missing = [];
for (const [index, row] of rows.entries()) {
  const code = codeFrom(value(row, ["Confirmation code", "Código de confirmación"]));
  const guest = value(row, ["Guest", "Huésped"]);
  const reservation = byCode.get(code);
  if (!reservation) missing.push({ rowNumber: index + 2, code, guest });
  else matches.push({ rowNumber: index + 2, code, guest, reservation });
}

console.log(JSON.stringify({
  csvRows: rows.length,
  dbAirbnbRows: dbRows.length,
  matches: matches.length,
  missing,
  placeholderBefore: matches.filter(({ reservation }) => /^Airbnb\s+HM/i.test(reservation.nombre_completo_huesped)).length,
  matches: matches.map(({ rowNumber, code, guest, reservation }) => ({
    rowNumber, code, guest, reservationId: reservation.id, before: reservation.nombre_completo_huesped,
    dates: [reservation.fecha_ingreso, reservation.fecha_salida], payment: [reservation.total_pago, reservation.abono, reservation.saldo]
  }))
}, null, 2));
db.close();
