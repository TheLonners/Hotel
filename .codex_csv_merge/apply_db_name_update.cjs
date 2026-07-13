const fs = require("fs");
const XLSX = require("C:/Users/Nick-Victus/Documents/Hotel/backend/node_modules/xlsx");
const { db } = require("../backend/src/database/db");
const { createBackup } = require("../backend/src/services/backupService");

const csvPath = "C:/Users/Nick-Victus/Downloads/airbnb_pending (2).csv";

function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function value(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const key = Object.keys(row).find((name) => wanted.has(normalizeHeader(name)));
  return key ? String(row[key] ?? "").trim().replace(/\s+/g, " ") : "";
}
function codeFrom(valueText) {
  const text = String(valueText || "").toUpperCase();
  return (text.match(/\bHM[A-Z0-9]{6,}\b/) || [""])[0];
}

async function main() {
  const backupRecord = await createBackup({ kind: "manual", includeUploads: false });
  const workbook = XLSX.read(fs.readFileSync(csvPath), { type: "buffer", raw: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true });

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

  const updates = [];
  const missing = [];
  for (const [index, row] of rows.entries()) {
    const code = codeFrom(value(row, ["Confirmation code", "Código de confirmación"]));
    const name = value(row, ["Guest", "Huésped"]);
    const reservation = byCode.get(code);
    if (!reservation || !name) {
      missing.push({ rowNumber: index + 2, code, name, reason: !reservation ? "ID no encontrado" : "Nombre vacío" });
      continue;
    }
    updates.push({ rowNumber: index + 2, code, name, reservationId: reservation.id, before: reservation.nombre_completo_huesped });
  }
  if (missing.length) throw new Error(`No se puede actualizar: ${JSON.stringify(missing)}`);

  const update = db.prepare(`
    UPDATE reservations
    SET nombre_completo_huesped = ?, fecha_actualizacion = datetime('now')
    WHERE id = ? AND origen_reserva = 'airbnb'
  `);
  const transaction = db.transaction(() => {
    for (const item of updates) {
      const result = update.run(item.name, item.reservationId);
      if (Number(result.changes) !== 1) throw new Error(`No se actualizó la reserva ${item.reservationId} (${item.code}).`);
    }
  });
  transaction();

  const after = db.prepare(`
    SELECT id, numero_remision, nombre_completo_huesped, fecha_ingreso, fecha_salida,
           total_pago, abono, saldo
    FROM reservations
    WHERE origen_reserva = 'airbnb'
  `).all();
  const updatedById = new Map(after.map((row) => [row.id, row]));
  const verification = updates.map((item) => ({
    ...item,
    after: updatedById.get(item.reservationId)?.nombre_completo_huesped || "",
    datesUnchanged: updatedById.get(item.reservationId)?.fecha_ingreso === dbRows.find((row) => row.id === item.reservationId)?.fecha_ingreso &&
      updatedById.get(item.reservationId)?.fecha_salida === dbRows.find((row) => row.id === item.reservationId)?.fecha_salida,
    paymentsUnchanged: updatedById.get(item.reservationId)?.total_pago === dbRows.find((row) => row.id === item.reservationId)?.total_pago &&
      updatedById.get(item.reservationId)?.abono === dbRows.find((row) => row.id === item.reservationId)?.abono &&
      updatedById.get(item.reservationId)?.saldo === dbRows.find((row) => row.id === item.reservationId)?.saldo
  }));
  const allNamesCorrect = verification.every((item) => item.after === item.name);
  const datesAndPaymentsUnchanged = verification.every((item) => item.datesUnchanged && item.paymentsUnchanged);
  if (!allNamesCorrect || !datesAndPaymentsUnchanged) throw new Error("La verificación posterior falló.");

  console.log(JSON.stringify({
    backup: { id: backupRecord.id, file_path: backupRecord.file_path, sha256: backupRecord.sha256 },
    csvRows: rows.length,
    updated: updates.length,
    missing,
    allNamesCorrect,
    datesAndPaymentsUnchanged,
    sample: verification.slice(0, 5)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
