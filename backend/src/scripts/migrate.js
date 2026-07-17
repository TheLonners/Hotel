const { db } = require("../database/db");

const version = db.prepare("PRAGMA user_version").get().user_version;
const migrations = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version);
console.log(JSON.stringify({ ok: true, schema_version: version, applied_migrations: migrations }, null, 2));
db.close();
