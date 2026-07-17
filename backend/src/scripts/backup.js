const { createBackup } = require("../services/backupService");

createBackup({ kind: process.env.BACKUP_KIND || "manual" })
  .then((record) => console.log(`Backup válido: ${record.file_name}`))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
