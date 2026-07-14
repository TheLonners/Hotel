import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const dbPath = "C:/Users/Nick-Victus/Documents/Hotel/data/hotel.sqlite";
const outputDir = "C:/Users/Nick-Victus/Documents/Hotel/outputs/019f5682-5a02-7042-9ec1-646cd2ead627";
const outputPath = `${outputDir}/reservas_airbnb_ids.xlsx`;
const previewPath = `${outputDir}/reservas_airbnb_ids_preview.png`;

function airbnbCode(value) {
  const match = String(value || "").toUpperCase().match(/\bHM[A-Z0-9]{6,}\b/);
  return match ? match[0] : String(value || "").replace(/^AIRBNB-/i, "").trim();
}

function asDate(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : null;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare(`
  SELECT id, numero_remision, nombre_completo_huesped, fecha_ingreso, fecha_salida,
         estado_reserva, origen_reserva, airbnb_ok
  FROM reservations
  WHERE origen_reserva = 'airbnb'
  ORDER BY id
`).all();
db.close();

const ids = rows.map((row) => airbnbCode(row.numero_remision));
const duplicateIds = ids.filter((id, index) => id && ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`IDs Airbnb duplicados: ${[...new Set(duplicateIds)].join(", ")}`);

const values = [
  ["ID reserva sistema", "ID Airbnb", "Estado ID Airbnb", "Nombre del huésped", "Fecha ingreso", "Fecha salida", "Estado reserva", "Origen", "Airbnb OK"],
  ...rows.map((row) => [
    Number(row.id),
    airbnbCode(row.numero_remision),
    airbnbCode(row.numero_remision) ? "Con ID" : "Sin ID Airbnb",
    String(row.nombre_completo_huesped || ""),
    asDate(row.fecha_ingreso),
    asDate(row.fecha_salida),
    String(row.estado_reserva || ""),
    String(row.origen_reserva || ""),
    Number(row.airbnb_ok || 0) === 1 ? "Sí" : "No"
  ])
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Reservas Airbnb");
sheet.showGridLines = false;
sheet.getRange(`A1:I${values.length}`).values = values;
sheet.getRange("A1:I1").format = {
  fill: "#FF385C",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center"
};
sheet.getRange(`A2:A${values.length}`).format.numberFormat = "0";
sheet.getRange(`E2:F${values.length}`).format.numberFormat = "yyyy-mm-dd";
sheet.getRange(`I2:I${values.length}`).format.horizontalAlignment = "center";
sheet.getRange(`A1:I${values.length}`).format.borders = { preset: "outside", style: "thin", color: "#D9D9D9" };
sheet.getRange(`A1:I${values.length}`).format.autofitColumns();
sheet.getRange(`A1:A${values.length}`).format.columnWidth = 16;
sheet.getRange(`B1:B${values.length}`).format.columnWidth = 17;
sheet.getRange(`C1:C${values.length}`).format.columnWidth = 17;
sheet.getRange(`D1:D${values.length}`).format.columnWidth = 34;
sheet.getRange(`E1:F${values.length}`).format.columnWidth = 15;
sheet.getRange(`G1:G${values.length}`).format.columnWidth = 18;
sheet.getRange(`H1:H${values.length}`).format.columnWidth = 12;
sheet.getRange(`I1:I${values.length}`).format.columnWidth = 12;
sheet.getRange("A1:I1").format.rowHeight = 24;
sheet.freezePanes.freezeRows(1);
sheet.tables.add(`A1:I${values.length}`, true, "AirbnbReservationsTable");

const inspection = await workbook.inspect({
  kind: "table",
  range: `Reservas Airbnb!A1:I${Math.min(values.length, 8)}`,
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 9,
  maxChars: 6000
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan"
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Reservas Airbnb", range: `A1:I${values.length}`, scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(JSON.stringify({ outputPath, rows: rows.length, rowsWithAirbnbId: ids.filter(Boolean).length, rowsWithoutAirbnbId: ids.filter((id) => !id).length, duplicateIds: [...new Set(duplicateIds)] }, null, 2));
