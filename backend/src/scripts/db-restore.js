const fs = require("node:fs");
const path = require("node:path");
const { backup, DatabaseSync } = require("node:sqlite");

const projectRoot = path.resolve(__dirname, "../../..");
const backupArgument = process.argv.indexOf("--backup");
const configuredBackupDir = process.env.BACKUP_DIR || process.env.DATABASE_BACKUP_DIR;
const backupRoot = configuredBackupDir ? path.resolve(projectRoot, configuredBackupDir) : path.join(projectRoot, "backups");
const databasePath = process.env.DATABASE_PATH ? path.resolve(projectRoot, process.env.DATABASE_PATH) : path.join(projectRoot, "data", "hotel.sqlite");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function requireConfirmation() {
  if (!process.argv.includes("--confirm") || !process.argv.includes("--app-stopped")) {
    throw new Error("Restauracion cancelada. Usa --backup <directorio> --confirm --app-stopped despues de detener la aplicacion.");
  }
}

async function snapshot(sourcePath, targetPath) {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    if (source.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("El archivo de origen no supera integrity_check.");
    await backup(source, targetPath);
  } finally { source.close(); }
  const target = new DatabaseSync(targetPath, { readOnly: true });
  try {
    if (target.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || target.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("La copia SQLite no supera las verificaciones.");
    }
  } finally { target.close(); }
}

async function main() {
  requireConfirmation();
  if (backupArgument < 0) throw new Error("Indica el directorio del respaldo con --backup.");
  const sourceRoot = path.resolve(projectRoot, process.argv[backupArgument + 1]);
  const sourcePath = sourceRoot.endsWith(".sqlite") ? sourceRoot : path.join(sourceRoot, "hotel.sqlite");
  if (!fs.existsSync(sourcePath)) throw new Error("No existe hotel.sqlite en el respaldo indicado.");
  if (!fs.existsSync(databasePath)) throw new Error("No existe la base activa; no se reemplazo nada.");

  const token = stamp();
  const recoveryDir = path.join(backupRoot, `hotel_pre_restore_${token}`);
  const recoveryPath = path.join(recoveryDir, "hotel.sqlite");
  const replacementPath = `${databasePath}.restore-${token}.tmp`;
  const archivedPath = `${databasePath}.before-restore-${token}`;
  let activeArchived = false;
  fs.mkdirSync(recoveryDir, { recursive: true });
  try {
    await snapshot(databasePath, recoveryPath);
    await snapshot(sourcePath, replacementPath);
    fs.renameSync(databasePath, archivedPath);
    activeArchived = true;
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(`${databasePath}${suffix}`)) fs.renameSync(`${databasePath}${suffix}`, `${archivedPath}${suffix}`);
    }
    fs.renameSync(replacementPath, databasePath);
    console.log(JSON.stringify({ ok: true, restored_from: path.basename(sourceRoot), recovery_backup: path.basename(recoveryDir), archived_database: path.basename(archivedPath) }, null, 2));
  } catch (error) {
    if (activeArchived && !fs.existsSync(databasePath) && fs.existsSync(archivedPath)) {
      fs.renameSync(archivedPath, databasePath);
      for (const suffix of ["-wal", "-shm"]) {
        if (!fs.existsSync(`${databasePath}${suffix}`) && fs.existsSync(`${archivedPath}${suffix}`)) {
          fs.renameSync(`${archivedPath}${suffix}`, `${databasePath}${suffix}`);
        }
      }
    }
    if (fs.existsSync(replacementPath)) fs.rmSync(replacementPath, { force: true });
    throw error;
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
