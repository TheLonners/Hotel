const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.argv[2] === "--worker") {
  const [, , , databasePath, roomId, group, signalPath] = process.argv;
  process.env.DATABASE_PATH = databasePath;
  const { db } = require("../database/db");
  const { createReservation } = require("../services/reservations");
  const wait = setInterval(() => {
    if (!fs.existsSync(signalPath)) return;
    clearInterval(wait);
    try {
      createReservation({
        roomIds: [Number(roomId)], nombre_completo_huesped: "Prueba de concurrencia", cantidad_huespedes: 1,
        fecha_ingreso: `2035-01-${String(Number(group)).padStart(2, "0")}`,
        fecha_salida: `2035-01-${String(Number(group) + 1).padStart(2, "0")}`,
        valor_base: 100, total_pago: 100, origen_reserva: "whatsapp"
      });
      console.log("created");
    } catch (error) {
      if (error.status === 409) console.log("conflict");
      else { console.error(error.message); process.exitCode = 1; }
    } finally { db.close(); }
  }, 5);
  return;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hotel-concurrency-"));
  const databasePath = path.join(tempDir, "hotel.sqlite");
  process.env.DATABASE_PATH = databasePath;
  const { db } = require("../database/db");
  const { createRoom } = require("../services/reservations");
  try {
    const room = createRoom({ codigo_habitacion: "CONC-01", nombre_habitacion: "Concurrencia", capacidad: 2, estado: "disponible" });
    db.close();
    const scenarios = [];
    for (const size of [10, 25, 50]) {
      const signal = path.join(tempDir, `start-${size}`);
      const workers = Array.from({ length: size }, () => spawn(process.execPath, [__filename, "--worker", databasePath, String(room.id), String(size), signal], {
        env: { ...process.env, DATABASE_PATH: databasePath, DATABASE_ENABLE_WAL: "true" }, stdio: ["ignore", "pipe", "pipe"]
      }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.writeFileSync(signal, "start");
      const outcomes = await Promise.all(workers.map((worker) => new Promise((resolve) => {
        let output = ""; let error = "";
        worker.stdout.on("data", (chunk) => { output += chunk; });
        worker.stderr.on("data", (chunk) => { error += chunk; });
        worker.on("exit", (code) => resolve({ code, output, error }));
      })));
      const created = outcomes.filter((item) => item.output.trim() === "created" && item.code === 0).length;
      const conflicts = outcomes.filter((item) => item.output.trim() === "conflict" && item.code === 0).length;
      const errors = outcomes.filter((item) => item.code !== 0 || (item.output.trim() !== "created" && item.output.trim() !== "conflict"));
      scenarios.push({ users: size, created, conflicts, errors: errors.length });
    }
    const ok = scenarios.every((item) => item.created === 1 && item.conflicts === item.users - 1 && item.errors === 0);
    console.log(JSON.stringify({ ok, scenarios }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
