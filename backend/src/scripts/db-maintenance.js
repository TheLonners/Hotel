const { db } = require("../database/db");
const { createBackup } = require("../services/backupService");

async function main() {
  const backup = await createBackup({ kind: "pre_maintenance" });
  db.exec("PRAGMA optimize;");
  if (process.argv.includes("--analyze")) db.exec("ANALYZE;");
  console.log(JSON.stringify({ ok: true, backup: backup.file_name, analyze: process.argv.includes("--analyze"), vacuum: "not-run" }, null, 2));
  db.close();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
