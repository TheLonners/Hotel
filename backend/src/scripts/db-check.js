const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const projectRoot = path.resolve(__dirname, "../../..");
const argument = process.argv.indexOf("--path");
const databasePath = argument >= 0
  ? path.resolve(projectRoot, process.argv[argument + 1])
  : (process.env.DATABASE_PATH ? path.resolve(projectRoot, process.env.DATABASE_PATH) : path.join(projectRoot, "data", "hotel.sqlite"));

if (!fs.existsSync(databasePath)) throw new Error("No existe la base de datos indicada.");

const db = new DatabaseSync(databasePath, { readOnly: true });
const scalar = (sql) => db.prepare(sql).get().total;
const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
const latestBackup = db.prepare(`
  SELECT file_name, created_at FROM backup_records
  WHERE status = 'valid' ORDER BY id DESC LIMIT 1
`).get();
const maxBackupAgeHours = Math.max(1, Number(process.env.DATABASE_BACKUP_MAX_AGE_HOURS || 26));
const backupAgeHours = latestBackup ? (Date.now() - Date.parse(`${latestBackup.created_at}Z`)) / 3600000 : Infinity;
const checks = {
  integrity: db.prepare("PRAGMA integrity_check").get().integrity_check,
  foreign_key_violations: foreignKeys.length,
  reservations_without_rooms: scalar("SELECT COUNT(*) AS total FROM reservations r WHERE NOT EXISTS (SELECT 1 FROM reservation_rooms rr WHERE rr.reserva_id = r.id)"),
  duplicate_room_assignments: scalar("SELECT COUNT(*) AS total FROM (SELECT reserva_id, habitacion_id FROM reservation_rooms GROUP BY reserva_id, habitacion_id HAVING COUNT(*) > 1)"),
  negative_payments: scalar("SELECT COUNT(*) AS total FROM payments WHERE monto < 0"),
  negative_reservation_amounts: scalar("SELECT COUNT(*) AS total FROM reservations WHERE total_pago < 0 OR abono < 0 OR saldo < 0"),
  inconsistent_balances: scalar("SELECT COUNT(*) AS total FROM reservations r WHERE ABS(COALESCE(r.saldo, 0) - (COALESCE(r.total_pago, 0) - COALESCE((SELECT SUM(p.monto) FROM payments p WHERE p.reserva_id = r.id), COALESCE(r.abono, 0)))) > 1"),
  invalid_dates: scalar("SELECT COUNT(*) AS total FROM reservations WHERE date(fecha_ingreso) IS NULL OR date(fecha_salida) IS NULL OR date(fecha_salida) < date(fecha_ingreso)"),
  unknown_reservation_states: scalar("SELECT COUNT(*) AS total FROM reservations WHERE estado_reserva IS NULL OR trim(estado_reserva) = '' OR estado_reserva NOT IN ('confirmada', 'pendiente', 'cancelada', 'finalizada')"),
  overlapping_reservations: scalar(`
    SELECT COUNT(*) AS total FROM (
      SELECT a.id, b.id, ar.habitacion_id
      FROM reservations a
      JOIN reservation_rooms ar ON ar.reserva_id = a.id
      JOIN reservations b ON b.id > a.id
      JOIN reservation_rooms br ON br.reserva_id = b.id AND br.habitacion_id = ar.habitacion_id
      WHERE a.estado_reserva <> 'cancelada' AND b.estado_reserva <> 'cancelada'
        AND date(a.fecha_ingreso) < date(CASE WHEN b.fecha_salida <= b.fecha_ingreso THEN date(b.fecha_ingreso, '+1 day') ELSE b.fecha_salida END)
        AND date(CASE WHEN a.fecha_salida <= a.fecha_ingreso THEN date(a.fecha_ingreso, '+1 day') ELSE a.fecha_salida END) > date(b.fecha_ingreso)
      GROUP BY a.id, b.id, ar.habitacion_id
    )
  `)
};

let freeBytes = null;
try { freeBytes = Number(fs.statfsSync(path.dirname(databasePath)).bavail) * Number(fs.statfsSync(path.dirname(databasePath)).bsize); } catch (_) {}
const minimumFreeBytes = Math.max(0, Number(process.env.DATABASE_MIN_FREE_MB || 1024)) * 1024 * 1024;
const result = {
  ok: checks.integrity === "ok" && Object.entries(checks).every(([key, value]) => key === "integrity" || value === 0) && backupAgeHours <= maxBackupAgeHours && (freeBytes === null || freeBytes >= minimumFreeBytes),
  sqlite_version: db.prepare("SELECT sqlite_version() AS version").get().version,
  schema_version: db.prepare("PRAGMA user_version").get().user_version,
  journal_mode: db.prepare("PRAGMA journal_mode").get().journal_mode,
  database_bytes: fs.statSync(databasePath).size,
  wal_bytes: fs.existsSync(`${databasePath}-wal`) ? fs.statSync(`${databasePath}-wal`).size : 0,
  free_bytes: freeBytes,
  minimum_free_bytes: minimumFreeBytes,
  latest_backup: latestBackup ? { file_name: latestBackup.file_name, age_hours: Number(backupAgeHours.toFixed(2)) } : null,
  checks
};
db.close();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
