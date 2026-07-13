import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";

const historicalPath = "C:/Users/Nick-Victus/Downloads/airbnb_01_2026-07_2026 (1).csv";
const pendingPath = "C:/Users/Nick-Victus/Downloads/airbnb_pending (2).csv";
const summaryPath = "C:/Users/Nick-Victus/Documents/Hotel/.codex_csv_merge/summary.json";
const outputPath = "C:/Users/Nick-Victus/Documents/Hotel/.codex_csv_merge/airbnb_pending_cruzado.csv";

function normalize(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function findColumn(headers, candidates) {
  const wanted = candidates.map(normalize);
  const index = headers.findIndex((header) => wanted.includes(normalize(header)));
  if (index < 0) throw new Error(`No se encontró ninguna columna: ${candidates.join(", ")}`);
  return index;
}

function csvEscape(value) {
  const text = cellText(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

const historicalCsv = await fs.readFile(historicalPath, "utf8");
const pendingCsv = await fs.readFile(pendingPath, "utf8");
const historicalWorkbook = await Workbook.fromCSV(historicalCsv, { sheetName: "Historial" });
const pendingWorkbook = await Workbook.fromCSV(pendingCsv, { sheetName: "Pendientes" });
const historicalSheet = historicalWorkbook.worksheets.getItem("Historial");
const pendingSheet = pendingWorkbook.worksheets.getItem("Pendientes");
const historicalRows = historicalSheet.getUsedRange().values;
const pendingRows = pendingSheet.getUsedRange().values;

const historicalHeaders = historicalRows[0].map(cellText);
const pendingHeaders = pendingRows[0].map(cellText);
const historicalIdCol = findColumn(historicalHeaders, ["Código de confirmación", "Confirmation code"]);
const pendingIdCol = findColumn(pendingHeaders, ["Código de confirmación", "Confirmation code"]);
const historicalNameCol = findColumn(historicalHeaders, ["Huésped", "Guest"]);
const pendingNameCol = findColumn(pendingHeaders, ["Huésped", "Guest"]);

const historicalMap = new Map();
const duplicateHistoricalIds = [];
for (const row of historicalRows.slice(1)) {
  const id = cellText(row[historicalIdCol]).trim();
  if (!id) continue;
  const name = cellText(row[historicalNameCol]).trim();
  if (historicalMap.has(id) && historicalMap.get(id) !== name) duplicateHistoricalIds.push({ id, previous: historicalMap.get(id), current: name });
  if (!historicalMap.has(id) || (!historicalMap.get(id) && name)) historicalMap.set(id, name);
}

const duplicatePendingIds = [];
const pendingIdCounts = new Map();
for (const row of pendingRows.slice(1)) {
  const id = cellText(row[pendingIdCol]).trim();
  if (id) pendingIdCounts.set(id, (pendingIdCounts.get(id) ?? 0) + 1);
}
for (const [id, count] of pendingIdCounts) if (count > 1) duplicatePendingIds.push({ id, count });

const resultHeaders = [...pendingHeaders, "Nombre del huésped", "Fuente del nombre", "Resultado del cruce"];
const resultRows = [resultHeaders];
let matched = 0;
let notFound = 0;
let pendingWithOriginalName = 0;
let pendingWithoutName = 0;
const examples = [];
for (const row of pendingRows.slice(1)) {
  const id = cellText(row[pendingIdCol]).trim();
  const originalName = cellText(row[pendingNameCol]).trim();
  const crossedName = historicalMap.get(id) ?? "";
  const finalName = crossedName || originalName;
  const source = crossedName ? "Historial Airbnb" : originalName ? "CSV pendiente" : "Sin nombre";
  const status = crossedName ? "Coincide en historial" : originalName ? "No coincidió; se conservó Guest" : "No encontrado y sin nombre";
  if (crossedName) matched++;
  else notFound++;
  if (originalName) pendingWithOriginalName++;
  else pendingWithoutName++;
  if (examples.length < 5) examples.push({ id, originalName, crossedName, status });
  resultRows.push([...row, finalName, source, status]);
}

await fs.writeFile(outputPath, writeCsv(resultRows), "utf8");
const summary = {
  historicalRows: historicalRows.length - 1,
  pendingRows: pendingRows.length - 1,
  historicalHeaders,
  pendingHeaders,
  joinKey: { historical: historicalHeaders[historicalIdCol], pending: pendingHeaders[pendingIdCol] },
  nameColumns: { historical: historicalHeaders[historicalNameCol], pending: pendingHeaders[pendingNameCol] },
  matched,
  notFound,
  pendingWithOriginalName,
  pendingWithoutName,
  duplicateHistoricalIds,
  duplicatePendingIds,
  sample: examples,
  outputPath,
};
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
