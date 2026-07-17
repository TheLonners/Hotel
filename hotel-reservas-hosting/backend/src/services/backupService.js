const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { backup, DatabaseSync } = require("node:sqlite");
const { db, databasePath, projectRoot } = require("../database/db");
const { recordAudit } = require("./audit");

const backupDir = process.env.BACKUP_DIR ? path.resolve(projectRoot, process.env.BACKUP_DIR) : path.join(projectRoot, "backups");
let running = false;

function stamp(now = new Date()) { return now.toISOString().replace(/[:.]/g, "-"); }
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function counts() {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
  return { rooms: count("rooms"), reservations: count("reservations"), imports: count("import_batches"), auditEvents: count("audit_events") };
}
function validateSnapshot(file) {
  const snapshot = new DatabaseSync(file, { open: false });
  snapshot.open();
  const integrity = snapshot.prepare("PRAGMA integrity_check").get().integrity_check;
  snapshot.close();
  if (integrity !== "ok") throw new Error(`Snapshot no íntegro: ${integrity}`);
}

async function createBackup({ kind = "manual", actorUserId = null, includeUploads = true } = {}) {
  if (running) { const error = new Error("Ya hay un backup en ejecución."); error.status = 409; throw error; }
  running = true;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const directory = path.join(backupDir, `hotel_${kind}_${stamp()}`);
    const temporary = `${directory}.tmp`;
    fs.mkdirSync(temporary, { recursive: true });
    const snapshotPath = path.join(temporary, "hotel.sqlite");
    await backup(db, snapshotPath);
    validateSnapshot(snapshotPath);
    const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(projectRoot, process.env.UPLOADS_DIR) : path.join(projectRoot, "uploads");
    if (includeUploads && fs.existsSync(uploadsDir)) fs.cpSync(uploadsDir, path.join(temporary, "uploads"), { recursive: true, force: false });
    const manifest = {
      version: 1,
      kind,
      createdAt: new Date().toISOString(),
      databaseFile: "hotel.sqlite",
      sha256: sha256(snapshotPath),
      schemaVersion: db.prepare("PRAGMA user_version").get().user_version,
      counts: counts(),
      uploadsIncluded: includeUploads,
      appVersion: process.env.npm_package_version || "1.0.0"
    };
    fs.writeFileSync(path.join(temporary, "manifest.json"), JSON.stringify(manifest, null, 2));
    fs.renameSync(temporary, directory);
    const sizeBytes = fs.statSync(snapshotPath.replace(temporary, directory)).size;
    const info = db.prepare(`INSERT INTO backup_records (kind,status,file_name,file_path,sha256,manifest_json,size_bytes,created_by_user_id)
      VALUES (?, 'valid', ?, ?, ?, ?, ?, ?)`)
      .run(kind, path.basename(directory), directory, manifest.sha256, JSON.stringify(manifest), sizeBytes, actorUserId);
    recordAudit({ actorUserId, action: "create", entityType: "backup", entityId: info.lastInsertRowid, details: { kind, file: path.basename(directory) } });
    return db.prepare("SELECT * FROM backup_records WHERE id = ?").get(info.lastInsertRowid);
  } catch (error) {
    recordAudit({ actorUserId, action: "failed", entityType: "backup", details: { kind, error: error.message } });
    throw error;
  } finally { running = false; }
}

function listBackups() { return db.prepare("SELECT * FROM backup_records ORDER BY created_at DESC, id DESC").all(); }
function validateBackup(id) {
  const record = db.prepare("SELECT * FROM backup_records WHERE id = ?").get(Number(id));
  if (!record) return null;
  const manifest = JSON.parse(record.manifest_json || "{}");
  const file = path.join(record.file_path, manifest.databaseFile || "hotel.sqlite");
  if (!fs.existsSync(file) || sha256(file) !== record.sha256) throw new Error("El hash del backup no coincide.");
  validateSnapshot(file);
  return record;
}

async function runDueBackups() {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const latestDaily = db.prepare("SELECT created_at FROM backup_records WHERE kind = 'daily' ORDER BY id DESC LIMIT 1").get();
  const latestMonthly = db.prepare("SELECT created_at FROM backup_records WHERE kind = 'monthly' ORDER BY id DESC LIMIT 1").get();
  const results = [];
  if (!latestDaily || !String(latestDaily.created_at).startsWith(today)) results.push(await createBackup({ kind: "daily" }));
  if (!latestMonthly || !String(latestMonthly.created_at).startsWith(month)) results.push(await createBackup({ kind: "monthly" }));
  return results;
}

module.exports = { backupDir, createBackup, listBackups, runDueBackups, validateBackup };
