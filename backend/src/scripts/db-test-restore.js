const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { backup, DatabaseSync } = require("node:sqlite");

const projectRoot = path.resolve(__dirname, "../../..");
const requested = process.argv.indexOf("--backup");
const configuredBackupDir = process.env.BACKUP_DIR || process.env.DATABASE_BACKUP_DIR;
const backupRoot = configuredBackupDir ? path.resolve(projectRoot, configuredBackupDir) : path.join(projectRoot, "backups");
function latestBackup() {
  return fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(backupRoot, entry.name, "hotel.sqlite")) && fs.existsSync(path.join(backupRoot, entry.name, "manifest.json")))
    .map((entry) => path.join(backupRoot, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
const sourceRoot = requested >= 0 ? path.resolve(projectRoot, process.argv[requested + 1]) : latestBackup();
const sourcePath = sourceRoot && sourceRoot.endsWith(".sqlite") ? sourceRoot : path.join(sourceRoot || "", "hotel.sqlite");

async function main() {
  if (!sourceRoot || !fs.existsSync(sourcePath)) throw new Error("No se encontro un backup SQLite para probar.");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  if (source.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("El backup no supera integrity_check.");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hotel-restore-test-"));
  const restoredPath = path.join(tempDir, "hotel.sqlite");
  try {
    await backup(source, restoredPath);
    source.close();
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    const integrity = restored.prepare("PRAGMA integrity_check").get().integrity_check;
    const foreignKeys = restored.prepare("PRAGMA foreign_key_check").all().length;
    const schemaVersion = restored.prepare("PRAGMA user_version").get().user_version;
    restored.close();
    if (integrity !== "ok" || foreignKeys) throw new Error("La restauracion temporal no supera las verificaciones.");
    console.log(JSON.stringify({ ok: true, schema_version: schemaVersion, integrity, foreign_key_violations: foreignKeys }, null, 2));
  } finally {
    try { source.close(); } catch (_) {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
