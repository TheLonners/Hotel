const fs = require("fs");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const multer = require("multer");

dotenv.config();

const { db, databasePath, projectRoot } = require("./database/db");
const { createUser, ensureBootstrapAdmin, login, publicUser, readSession } = require("./services/auth");
const { listAudit, recordAudit } = require("./services/audit");
const { createGuest, getGuest, linkGuest, searchGuests } = require("./services/guests");
const { backupDir, createBackup, listBackups, runDueBackups, validateBackup } = require("./services/backupService");
const {
  addPayment,
  availability,
  asNumber,
  createReservation,
  createRoom,
  deletePayment,
  deleteReservation,
  getClientByCedula,
  getReservation,
  getReservations,
  getRoomById,
  recalculateReservationPayments,
  updatePayment,
  updateReservation,
  updateRoom,
  validateAvailability
} = require("./services/reservations");
const { addDays, compareDates, diffNights, effectiveCheckOut, parseDateValue, toISODate } = require("./services/dates");
const { confirmImport, parseWorkbook } = require("./services/importer");
const { buildRoomsWorkbook, confirmRoomsImport, parseRoomsWorkbook } = require("./services/roomBulk");
const { sortRooms } = require("./services/roomOrdering");
const {
  createAirbnbFeed,
  deleteAirbnbFeed,
  listAirbnbFeeds,
  syncAllAirbnbFeeds,
  syncAirbnbFeed,
  syncDueAirbnbFeeds,
  testRoomIcalLink,
  updateAirbnbFeed
} = require("./services/airbnbSync");
const { importAirbnbNames, previewAirbnbImport } = require("./services/airbnbNameImport");
const { getAirbnbListingDetails } = require("./services/airbnbDetails");
const {
  exportBalances,
  exportPayments,
  exportReservationsExcel,
  exportReservationsNormalized,
  exportRooms
} = require("./services/exporter");
const { buildImportTemplateWorkbook } = require("./services/importTemplate");
const {
  cleaningCsv,
  getTodayOperations,
  listCleaning,
  setCleaningStatus
} = require("./services/operations");
const {
  buildBillingPdf,
  buildBillingWorkbook,
  computeBilling
} = require("./services/billingAccount");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const authEnabled = String(process.env.AUTH_ENABLED || "false").trim().toLowerCase() === "true";
const airbnbSyncPollMinutes = Math.max(5, Number(process.env.AIRBNB_SYNC_POLL_MINUTES || 15));
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(projectRoot, process.env.UPLOADS_DIR)
  : path.join(projectRoot, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
ensureBootstrapAdmin();

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((item) => item.trim()) }));
app.use(express.json({ limit: "20mb" }));
function requireAuth(req, res, next) {
  const apiPath = String(req.originalUrl || req.url || "").split("?")[0];
  if (!apiPath.startsWith("/api") || apiPath === "/api/health" || apiPath === "/api/auth/login") return next();
  if (!authEnabled) {
    req.user = { id: null, username: "local", role: "admin", active: true };
    return next();
  }
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const sessionUser = readSession(token);
  if (sessionUser) { req.user = publicUser(sessionUser); return next(); }
  const legacy = String(req.headers["x-admin-password"] || "");
  if (legacy && process.env.ADMIN_PASSWORD && legacy === process.env.ADMIN_PASSWORD) {
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get();
    if (admin) { req.user = publicUser(admin); return next(); }
  }
  const userCount = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  if (!userCount) return res.status(503).json({ error: "Autenticacion pendiente de configuracion." });
  return res.status(401).json({ error: "Inicia sesión para acceder a la administración." });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!authEnabled) return next();
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "No tienes permiso para esta acción." });
    return next();
  };
}

app.post("/api/auth/login", (req, res) => {
  const result = login(req.body?.username, req.body?.password);
  if (!result) return res.status(401).json({ error: "Usuario o contraseña inválidos." });
  return res.json(result);
});

app.use(requireAuth);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

function workbookFileFilter(_req, file, cb) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const allowedExtensions = new Set([".csv", ".xls", ".xlsx"]);
  const allowedTypes = new Set([
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv"
  ]);
  if (allowedExtensions.has(extension) && (!file.mimetype || allowedTypes.has(file.mimetype))) return cb(null, true);

  const error = new Error("Solo se aceptan archivos Excel o CSV.");
  error.status = 400;
  return cb(error);
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: workbookFileFilter
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sendCsv(res, fileName, content) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(content);
}

function sendXlsx(res, fileName, buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
}

function sendPdf(res, fileName, buffer) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => res.json({ user: req.user || null }));

app.get("/api/audit", requireRole("admin"), (req, res) => res.json(listAudit(req.query.entity_type || "", req.query.entity_id || "")));

app.get("/api/backups", requireRole("admin"), (_req, res) => {
  res.json({ directory: backupDir, items: listBackups() });
});

app.post("/api/backups", requireRole("admin"), asyncRoute(async (req, res) => {
  const kind = ["manual", "daily", "monthly"].includes(req.body?.kind) ? req.body.kind : "manual";
  res.status(201).json(await createBackup({ kind, actorUserId: req.user.id }));
}));

app.post("/api/backups/:id/validate", requireRole("admin"), (req, res) => {
  const record = validateBackup(Number(req.params.id));
  if (!record) return res.status(404).json({ error: "Backup no encontrado." });
  return res.json({ ok: true, record });
});

app.get("/api/users", requireRole("admin"), (_req, res) => {
  res.json(db.prepare("SELECT id, username, role, active, created_at, updated_at FROM users ORDER BY username").all());
});

app.post("/api/users", requireRole("admin"), (req, res) => {
  res.status(201).json(createUser(req.body || {}, req.user.id));
});

app.get("/uploads/:file", requireRole("admin", "recepcion"), (req, res) => {
  const file = path.basename(req.params.file);
  const known = db.prepare(`
    SELECT id FROM attachments WHERE ruta_archivo = ?
    UNION ALL
    SELECT id FROM cleaning_evidence WHERE ruta_archivo = ?
    LIMIT 1
  `).get(`/uploads/${file}`, `/uploads/${file}`);
  if (!known) return res.status(404).json({ error: "Archivo no encontrado." });
  return res.sendFile(path.join(uploadsDir, file));
});

app.get("/api/rooms", (_req, res) => {
  const rooms = sortRooms(db.prepare("SELECT * FROM rooms").all());
  res.json(rooms);
});

app.get("/api/clients", requireRole("admin", "recepcion", "consulta"), (req, res) => {
  const cedula = String(req.query.cedula || "").trim();
  if (!cedula) return res.status(400).json({ error: "Cedula requerida." });
  res.json(getClientByCedula(cedula));
});

app.get("/api/guests", requireRole("admin", "recepcion", "consulta"), (req, res) => {
  res.json(searchGuests(req.query.q || ""));
});

app.get("/api/guests/:id", requireRole("admin", "recepcion", "consulta"), (req, res) => {
  const guest = getGuest(Number(req.params.id));
  if (!guest) return res.status(404).json({ error: "Huésped no encontrado." });
  res.json(guest);
});

app.post("/api/guests", requireRole("admin", "recepcion"), (req, res) => {
  res.status(201).json(createGuest(req.body || {}, req.user.id));
});

app.post("/api/reservations/:id/guests", requireRole("admin", "recepcion"), (req, res) => {
  linkGuest(Number(req.params.id), Number(req.body?.guest_id), {
    isPrimaryGuest: Boolean(req.body?.is_primary_guest),
    guestCategory: req.body?.guest_category || "adult"
  }, req.user.id);
  res.json(getReservation(Number(req.params.id)));
});

app.post("/api/rooms", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const room = createRoom(req.body);
  res.status(201).json(room);
}));

app.put("/api/rooms/:id", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const room = updateRoom(Number(req.params.id), req.body);
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  res.json(room);
}));

app.post("/api/rooms/:id/airbnb-ical/test", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  res.json(await testRoomIcalLink(Number(req.params.id), req.body || {}));
}));

app.delete("/api/rooms/:id", requireRole("admin", "recepcion"), (req, res) => {
  const room = updateRoom(Number(req.params.id), { estado: "inactiva" });
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  res.json({ ok: true, room });
});

app.get("/api/reservations", (req, res) => {
  res.json(getReservations(req.query));
});

app.get("/api/reservations/:id", (req, res) => {
  const reservation = getReservation(Number(req.params.id));
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada." });
  res.json(reservation);
});

app.post("/api/reservations", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const reservation = createReservation(req.body);
  res.status(201).json(reservation);
}));

app.put("/api/reservations/:id", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const reservation = updateReservation(Number(req.params.id), req.body);
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada." });
  res.json(reservation);
}));

app.put("/api/reservations/:id/arrival", requireRole("admin", "recepcion"), (req, res) => {
  const id = Number(req.params.id);
  const reservation = getReservation(id);
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada." });
  const verified = req.body?.llegada_verificada ? 1 : 0;
  db.prepare("UPDATE reservations SET llegada_verificada = ?, fecha_actualizacion = datetime('now') WHERE id = ?").run(verified, id);
  res.json(getReservation(id));
});

app.delete("/api/reservations/:id", requireRole("admin", "recepcion"), (req, res) => {
  if (!deleteReservation(Number(req.params.id))) return res.status(404).json({ error: "Reserva no encontrada." });
  res.json({ ok: true });
});

app.post("/api/reservations/:id/rooms", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const reservation = getReservation(Number(req.params.id));
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada." });
  const roomId = Number(req.body.roomId || req.body.habitacion_id);
  const room = getRoomById(roomId);
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  validateAvailability([roomId], reservation.fecha_ingreso, reservation.fecha_salida, reservation.id, {
    ignoreAirbnbBlocks: reservation.origen_reserva !== "airbnb"
  });
  db.prepare(`
    INSERT INTO reservation_rooms (reserva_id, habitacion_id, codigo_habitacion_original, precio_asignado, notas)
    VALUES (?, ?, ?, ?, ?)
  `).run(reservation.id, room.id, room.codigo_habitacion, req.body.precio_asignado || reservation.valor_base, req.body.notas || "");
  res.status(201).json(getReservation(reservation.id));
}));

app.delete("/api/reservations/:id/rooms/:roomId", requireRole("admin", "recepcion"), (req, res) => {
  db.prepare("DELETE FROM reservation_rooms WHERE reserva_id = ? AND habitacion_id = ?").run(Number(req.params.id), Number(req.params.roomId));
  res.json(getReservation(Number(req.params.id)));
});

app.get("/api/reservations/:id/payments", (req, res) => {
  const payments = db.prepare("SELECT * FROM payments WHERE reserva_id = ? ORDER BY fecha_pago DESC, id DESC").all(Number(req.params.id));
  res.json(payments);
});

app.post("/api/reservations/:id/payments", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const payment = addPayment(Number(req.params.id), req.body);
  if (!payment) return res.status(404).json({ error: "Reserva no encontrada." });
  res.status(201).json({ payment, reservation: getReservation(Number(req.params.id)) });
}));

app.put("/api/payments/:id", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const payment = updatePayment(Number(req.params.id), req.body);
  if (!payment) return res.status(404).json({ error: "Pago no encontrado." });
  res.json(payment);
}));

app.delete("/api/payments/:id", requireRole("admin", "recepcion"), (req, res) => {
  if (!deletePayment(Number(req.params.id))) return res.status(404).json({ error: "Pago no encontrado." });
  res.json({ ok: true });
});

app.post("/api/reservations/:id/attachments", requireRole("admin", "recepcion"), upload.single("file"), asyncRoute(async (req, res) => {
  const reservation = getReservation(Number(req.params.id));
  if (!reservation) return res.status(404).json({ error: "Reserva no encontrada." });
  if (!req.file) return res.status(400).json({ error: "Adjunta una imagen o PDF." });
  const route = `/uploads/${req.file.filename}`;
  const info = db.prepare(`
    INSERT INTO attachments (reserva_id, pago_id, nombre_archivo, ruta_archivo, tipo_archivo, monto_reportado, nota)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    reservation.id,
    req.body.pago_id || null,
    req.file.originalname,
    route,
    req.file.mimetype,
    req.body.monto_reportado ? asNumber(req.body.monto_reportado, null) : null,
    req.body.nota || ""
  );
  res.status(201).json(db.prepare("SELECT * FROM attachments WHERE id = ?").get(info.lastInsertRowid));
}));

app.get("/api/reservations/:id/attachments", (req, res) => {
  const attachments = db.prepare("SELECT * FROM attachments WHERE reserva_id = ? ORDER BY fecha_subida DESC").all(Number(req.params.id));
  res.json(attachments);
});

app.delete("/api/attachments/:id", requireRole("admin", "recepcion"), (req, res) => {
  const attachment = db.prepare("SELECT * FROM attachments WHERE id = ?").get(Number(req.params.id));
  if (!attachment) return res.status(404).json({ error: "Comprobante no encontrado." });
  const filePath = path.join(uploadsDir, path.basename(attachment.ruta_archivo));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare("DELETE FROM attachments WHERE id = ?").run(attachment.id);
  res.json({ ok: true });
});

app.get("/api/availability", asyncRoute(async (req, res) => {
  res.json(availability({
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    guests: req.query.guests,
    type: req.query.type || ""
  }));
}));

app.get("/api/today", (req, res) => {
  res.json(getTodayOperations(parseDateValue(req.query.date) || toISODate(new Date())));
});

app.get("/api/cleaning", (req, res) => {
  res.json(listCleaning(parseDateValue(req.query.date) || toISODate(new Date())));
});

app.put("/api/cleaning/:roomId", requireRole("admin", "recepcion", "aseo"), (req, res) => {
  const room = getRoomById(Number(req.params.roomId));
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  res.json(setCleaningStatus(room.id, req.body));
});

app.get("/api/cleaning/:roomId/evidence", (req, res) => {
  const room = getRoomById(Number(req.params.roomId));
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  const date = parseDateValue(req.query.date) || toISODate(new Date());
  res.json(db.prepare(`
    SELECT * FROM cleaning_evidence
    WHERE habitacion_id = ? AND fecha = ?
    ORDER BY fecha_subida DESC, id DESC
  `).all(room.id, date));
});

app.post("/api/cleaning/:roomId/evidence", requireRole("admin", "recepcion", "aseo"), upload.single("file"), (req, res) => {
  const room = getRoomById(Number(req.params.roomId));
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  if (!req.file || !req.file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Adjunta una imagen de evidencia." });
  const date = parseDateValue(req.body.fecha) || toISODate(new Date());
  const result = db.prepare(`
    INSERT INTO cleaning_evidence (habitacion_id, fecha, nombre_archivo, ruta_archivo, tipo_archivo, nota)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(room.id, date, req.file.originalname, `/uploads/${req.file.filename}`, req.file.mimetype, req.body.nota || "");
  res.status(201).json(db.prepare("SELECT * FROM cleaning_evidence WHERE id = ?").get(result.lastInsertRowid));
});

app.get("/api/cleaning/export.csv", (req, res) => {
  const date = parseDateValue(req.query.date) || toISODate(new Date());
  sendCsv(res, `limpieza-${date}.csv`, cleaningCsv(date));
});

app.get("/api/blocks", (_req, res) => {
  const blocks = db.prepare(`
    SELECT b.*, r.codigo_habitacion, r.nombre_habitacion, r.color_calendario
    FROM blocks b
    JOIN rooms r ON r.id = b.habitacion_id
    ORDER BY date(b.fecha_inicio) ASC
  `).all();
  res.json(blocks);
});

function getBlockWithRoom(id) {
  return db.prepare(`
    SELECT b.*, r.codigo_habitacion, r.nombre_habitacion, r.color_calendario
    FROM blocks b
    JOIN rooms r ON r.id = b.habitacion_id
    WHERE b.id = ?
  `).get(id);
}

function validateBlockAvailability(roomId, start, end, excludeBlockId = null) {
  const occupancyEnd = effectiveCheckOut(start, end);
  const reservation = db.prepare(`
    SELECT r.id FROM reservations r JOIN reservation_rooms rr ON rr.reserva_id = r.id
    WHERE rr.habitacion_id = ? AND r.estado_reserva NOT IN ('cancelada')
      AND date(r.fecha_ingreso) < date(?)
      AND date(CASE WHEN r.fecha_salida <= r.fecha_ingreso THEN date(r.fecha_ingreso, '+1 day') ELSE r.fecha_salida END) > date(?) LIMIT 1
  `).get(roomId, occupancyEnd, start);
  if (reservation) { const error = new Error("El bloqueo cruza con una reserva existente."); error.status = 409; throw error; }
  const block = db.prepare(`
    SELECT id FROM blocks WHERE habitacion_id = ? AND (? IS NULL OR id != ?)
      AND date(fecha_inicio) < date(?)
      AND date(CASE WHEN fecha_fin <= fecha_inicio THEN date(fecha_inicio, '+1 day') ELSE fecha_fin END) > date(?) LIMIT 1
  `).get(roomId, excludeBlockId, excludeBlockId, occupancyEnd, start);
  if (block) { const error = new Error("El bloqueo cruza con otro bloqueo."); error.status = 409; throw error; }
}

app.post("/api/blocks", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const roomId = Number(req.body.habitacion_id || req.body.roomId);
  const room = getRoomById(roomId);
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  const start = parseDateValue(req.body.fecha_inicio);
  const end = parseDateValue(req.body.fecha_fin);
  if (!start || !end || compareDates(end, start) < 0) return res.status(400).json({ error: "Fechas de bloqueo invalidas." });
  const origenBloqueo = ["airbnb", "evento"].includes(String(req.body.origen_bloqueo || "").toLowerCase())
    ? String(req.body.origen_bloqueo).toLowerCase()
    : "manual";
  const tipoBloqueo = ["airbnb", "evento", "manual"].includes(String(req.body.tipo_bloqueo || "").toLowerCase())
    ? String(req.body.tipo_bloqueo).toLowerCase()
    : origenBloqueo;
  const info = db.transaction(() => {
    validateBlockAvailability(roomId, start, end);
    return db.prepare(`
    INSERT INTO blocks (habitacion_id, fecha_inicio, fecha_fin, motivo, notas, origen_bloqueo, tipo_bloqueo, grupo_bloqueo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    roomId,
    start,
    end,
    req.body.motivo || (tipoBloqueo === "evento" ? "Evento" : "Bloqueo"),
    req.body.notas || "",
    origenBloqueo,
    tipoBloqueo,
      req.body.grupo_bloqueo || ""
    );
  })();
  res.status(201).json(getBlockWithRoom(info.lastInsertRowid));
}));

app.put("/api/blocks/:id", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const block = db.prepare("SELECT * FROM blocks WHERE id = ?").get(Number(req.params.id));
  if (!block) return res.status(404).json({ error: "Bloqueo no encontrado." });
  const start = parseDateValue(req.body.fecha_inicio ?? block.fecha_inicio);
  const end = parseDateValue(req.body.fecha_fin ?? block.fecha_fin);
  if (!start || !end || compareDates(end, start) < 0) return res.status(400).json({ error: "Fechas de bloqueo invalidas." });
  const origenBloqueo = ["airbnb", "evento", "manual"].includes(String(req.body.origen_bloqueo ?? block.origen_bloqueo ?? "").toLowerCase())
    ? String(req.body.origen_bloqueo ?? block.origen_bloqueo).toLowerCase()
    : "manual";
  const tipoBloqueo = ["airbnb", "evento", "manual"].includes(String(req.body.tipo_bloqueo ?? block.tipo_bloqueo ?? "").toLowerCase())
    ? String(req.body.tipo_bloqueo ?? block.tipo_bloqueo).toLowerCase()
    : origenBloqueo;
  const roomId = Number(req.body.habitacion_id || req.body.roomId || block.habitacion_id);
  const room = getRoomById(roomId);
  if (!room) return res.status(404).json({ error: "Habitacion no encontrada." });
  db.transaction(() => {
    validateBlockAvailability(roomId, start, end, block.id);
    db.prepare(`
    UPDATE blocks
    SET habitacion_id = ?, fecha_inicio = ?, fecha_fin = ?, motivo = ?, notas = ?,
        origen_bloqueo = ?, tipo_bloqueo = ?, grupo_bloqueo = ?
    WHERE id = ?
    `).run(
    roomId,
    start,
    end,
    req.body.motivo ?? block.motivo,
    req.body.notas ?? block.notas,
    origenBloqueo,
    tipoBloqueo,
    req.body.grupo_bloqueo ?? block.grupo_bloqueo ?? "",
      block.id
    );
  })();
  res.json(getBlockWithRoom(block.id));
}));

app.delete("/api/blocks/:id", requireRole("admin", "recepcion"), (req, res) => {
  db.prepare("DELETE FROM blocks WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/api/airbnb-sync/feeds", (_req, res) => {
  res.json(listAirbnbFeeds());
});

app.post("/api/airbnb-sync/feeds", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const feed = createAirbnbFeed(req.body);
  res.status(201).json(feed);
}));

app.put("/api/airbnb-sync/feeds/:id", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const feed = updateAirbnbFeed(Number(req.params.id), req.body);
  if (!feed) return res.status(404).json({ error: "Sincronizacion Airbnb no encontrada." });
  res.json(feed);
}));

app.delete("/api/airbnb-sync/feeds/:id", requireRole("admin", "recepcion"), (req, res) => {
  deleteAirbnbFeed(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/airbnb-sync/feeds/:id/sync", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  res.json(await syncAirbnbFeed(Number(req.params.id)));
}));

app.post("/api/airbnb-sync/sync-due", requireRole("admin", "recepcion"), asyncRoute(async (_req, res) => {
  res.json({ results: await syncDueAirbnbFeeds() });
}));

app.post("/api/airbnb-sync/sync-all", requireRole("admin", "recepcion"), asyncRoute(async (_req, res) => {
  res.json({ results: await syncAllAirbnbFeeds() });
}));

app.get("/api/airbnb/rooms/:id/details", asyncRoute(async (req, res) => {
  res.json(await getAirbnbListingDetails(Number(req.params.id), req.query));
}));

app.post("/api/airbnb-sync/import-names", requireRole("admin", "recepcion"), memoryUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo CSV o Excel exportado de Airbnb." });
  let listingMappings = {};
  if (req.body.listingMappings) {
    try {
      listingMappings = JSON.parse(req.body.listingMappings);
    } catch (_error) {
      listingMappings = {};
    }
  }
  res.json(importAirbnbNames(req.file.buffer, req.file.originalname, { listingMappings }));
}));

app.post("/api/airbnb-sync/import-preview", requireRole("admin", "recepcion"), memoryUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo CSV o Excel exportado de Airbnb." });
  res.json(previewAirbnbImport(req.file.buffer, req.file.originalname));
}));

app.post("/api/import/excel/preview", requireRole("admin", "recepcion"), memoryUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo .xlsx o .csv." });
  const preview = parseWorkbook(req.file.buffer, req.file.originalname);
  res.json({
    sessionId: preview.sessionId,
    fileName: preview.fileName,
    sheetName: preview.sheetName,
    columns: preview.columns,
    rows: preview.rows.slice(0, 100),
    totalRows: preview.rows.length,
    alerts: preview.alerts,
    canImportCount: preview.rows.filter((row) => row.canImport).length
  });
}));

app.get("/api/import/excel/template", (_req, res) => {
  sendXlsx(res, "guia-importacion-reservas-hotel.xlsx", buildImportTemplateWorkbook());
});

app.post("/api/import/excel/confirm", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const result = confirmImport(req.body.sessionId, { force: Boolean(req.body.force) });
  res.json(result);
}));

app.post("/api/import/rooms/preview", requireRole("admin", "recepcion"), memoryUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo .xlsx o .csv con habitaciones." });
  const preview = parseRoomsWorkbook(req.file.buffer, req.file.originalname);
  res.json({
    sessionId: preview.sessionId,
    fileName: preview.fileName,
    sheetName: preview.sheetName,
    headerRow: preview.headerRow,
    columns: preview.columns,
    rows: preview.rows.slice(0, 150),
    totalRows: preview.rows.length,
    alerts: preview.alerts,
    canImportCount: preview.rows.filter((row) => row.canImport).length,
    createCount: preview.rows.filter((row) => row.canImport && row.action === "crear").length,
    updateCount: preview.rows.filter((row) => row.canImport && row.action === "actualizar").length
  });
}));

app.post("/api/import/rooms/confirm", requireRole("admin", "recepcion"), asyncRoute(async (req, res) => {
  const result = await confirmRoomsImport(req.body.sessionId, { mode: req.body.mode });
  res.json(result);
}));

app.get("/api/imports", (_req, res) => {
  const imports = db.prepare("SELECT * FROM imports ORDER BY fecha_importacion DESC").all();
  res.json(imports);
});

app.get("/api/imports/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM imports WHERE id = ?").get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Importacion no encontrada." });
  const alerts = db.prepare("SELECT * FROM alerts WHERE importacion_id = ? ORDER BY fecha_creacion DESC").all(item.id);
  res.json({ ...item, alerts });
});

app.get("/api/export/reservations.csv", (req, res) => {
  sendCsv(res, "reservas-normalizadas.csv", exportReservationsNormalized(req.query));
});

app.get("/api/export/reservations-excel-format.csv", (req, res) => {
  sendCsv(res, "reservas-formato-excel.csv", exportReservationsExcel(req.query));
});

app.get("/api/export/rooms.csv", (_req, res) => {
  sendCsv(res, "habitaciones.csv", exportRooms());
});

app.get("/api/export/rooms.xlsx", (_req, res) => {
  sendXlsx(res, "habitaciones-actuales-cargue-masivo.xlsx", buildRoomsWorkbook());
});

app.get("/api/export/payments.csv", (_req, res) => {
  sendCsv(res, "pagos.csv", exportPayments());
});

app.get("/api/export/balances.csv", (req, res) => {
  sendCsv(res, "saldos-pendientes.csv", exportBalances(req.query));
});

app.get("/api/billing-account", (req, res) => {
  res.json(computeBilling({
    start: req.query.start,
    end: req.query.end,
    porcentaje: req.query.porcentaje,
    conectividad: req.query.conectividad,
    otros: req.query.otros,
    emisor_nombre: req.query.emisor_nombre,
    emisor_documento: req.query.emisor_documento,
    emisor_telefono: req.query.emisor_telefono,
    emisor_correo: req.query.emisor_correo
  }));
});

app.post("/api/billing-account/export.xlsx", requireRole("admin", "recepcion"), (req, res) => {
  sendXlsx(res, "cuenta-cobro-vista-montana.xlsx", buildBillingWorkbook(req.body || {}));
});

app.post("/api/billing-account/export.pdf", requireRole("admin", "recepcion"), (req, res) => {
  sendPdf(res, "cuenta-cobro-vista-montana.pdf", buildBillingPdf(req.body || {}));
});

app.get("/api/dashboard", (req, res) => {
  const today = toISODate(new Date());
  const tomorrow = effectiveCheckOut(today, today);
  const defaultStart = `${today.slice(0, 7)}-01`;
  const defaultNextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  const start = parseDateValue(req.query.start) || defaultStart;
  const end = parseDateValue(req.query.end) || toISODate(defaultNextMonth);
  const safeEnd = compareDates(end, start) > 0 ? end : addDays(start, 1);
  const channel = ["airbnb", "whatsapp"].includes(String(req.query.origen_reserva || "").toLowerCase())
    ? String(req.query.origen_reserva).toLowerCase()
    : "";
  const reservationChannel = channel ? " AND origen_reserva = @channel" : "";
  const reservationChannelR = channel ? " AND r.origen_reserva = @channel" : "";

  const scalar = (sql, params = {}) => db.prepare(sql).get(params)?.value || 0;
  const baseParams = channel ? { start, end: safeEnd, channel } : { start, end: safeEnd };
  const reservasHoy = scalar(
    `SELECT COUNT(*) AS value FROM reservations WHERE fecha_ingreso = @today AND estado_reserva NOT IN ('cancelada')${reservationChannel}`,
    channel ? { today, channel } : { today }
  );
  const ingresosPeriodo = scalar(`
    SELECT COALESCE(SUM(total_pago), 0) AS value FROM reservations
    WHERE estado_reserva NOT IN ('cancelada') AND date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
  `, baseParams);
  const abonadoPeriodo = channel
    ? scalar(`
      SELECT COALESCE(SUM(p.monto), 0) AS value FROM payments p
      JOIN reservations r ON r.id = p.reserva_id
      WHERE date(p.fecha_pago) >= date(@start) AND date(p.fecha_pago) < date(@end)
        AND r.origen_reserva = @channel
    `, baseParams)
    : scalar(`
      SELECT COALESCE(SUM(monto), 0) AS value FROM payments
      WHERE date(fecha_pago) >= date(@start) AND date(fecha_pago) < date(@end)
    `, baseParams);
  const reservasPeriodo = scalar(`
    SELECT COUNT(*) AS value FROM reservations
    WHERE estado_reserva NOT IN ('cancelada') AND date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
  `, baseParams);
  const nochesPeriodo = scalar(`
    SELECT COALESCE(SUM(noches), 0) AS value FROM reservations
    WHERE estado_reserva NOT IN ('cancelada') AND date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
  `, baseParams);
  const saldoPeriodo = scalar(`
    SELECT COALESCE(SUM(saldo), 0) AS value FROM reservations
    WHERE saldo > 0 AND estado_reserva NOT IN ('cancelada') AND date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
  `, baseParams);
  const saldosPendientes = scalar(
    `SELECT COALESCE(SUM(saldo), 0) AS value FROM reservations WHERE saldo > 0 AND estado_reserva NOT IN ('cancelada')${reservationChannel}`,
    channel ? { channel } : {}
  );
  const ocupadasHoy = scalar(`
    SELECT COUNT(DISTINCT rr.habitacion_id) AS value
    FROM reservation_rooms rr
    JOIN reservations r ON r.id = rr.reserva_id
    WHERE r.estado_reserva NOT IN ('cancelada')
      AND date(r.fecha_ingreso) < date(@tomorrow)
      AND date(CASE WHEN r.fecha_salida <= r.fecha_ingreso THEN date(r.fecha_ingreso, '+1 day') ELSE r.fecha_salida END) > date(@today)
      ${reservationChannelR}
  `, channel ? { today, tomorrow, channel } : { today, tomorrow });
  const bloqueadasHoy = scalar(`
    SELECT COUNT(DISTINCT habitacion_id) AS value FROM blocks
    WHERE date(fecha_inicio) < date(@tomorrow)
      AND date(CASE WHEN fecha_fin <= fecha_inicio THEN date(fecha_inicio, '+1 day') ELSE fecha_fin END) > date(@today)
  `, { today, tomorrow });
  const habitacionesDisponibles = scalar("SELECT COUNT(*) AS value FROM rooms WHERE estado = 'disponible'", {}) - ocupadasHoy - bloqueadasHoy;
  const sinComprobante = scalar(`
    SELECT COUNT(*) AS value FROM reservations r
    WHERE NOT EXISTS (SELECT 1 FROM attachments a WHERE a.reserva_id = r.id)
      AND r.estado_reserva NOT IN ('cancelada')
      ${reservationChannelR}
  `, channel ? { channel } : {});
  const conAlertas = channel
    ? scalar(`
      SELECT COUNT(DISTINCT al.reserva_id) AS value
      FROM alerts al
      JOIN reservations r ON r.id = al.reserva_id
      WHERE al.resuelta = 0 AND al.reserva_id IS NOT NULL AND r.origen_reserva = @channel
    `, { channel })
    : scalar("SELECT COUNT(DISTINCT reserva_id) AS value FROM alerts WHERE resuelta = 0 AND reserva_id IS NOT NULL", {});
  const reservationFilters = channel ? { start, end: safeEnd, origen_reserva: channel } : { start, end: safeEnd };
  const proximosIngresos = getReservations(reservationFilters).filter((r) => r.fecha_ingreso >= today).slice(0, 10);
  const proximasSalidas = getReservations(reservationFilters).filter((r) => r.fecha_salida >= today).sort((a, b) => a.fecha_salida.localeCompare(b.fecha_salida)).slice(0, 10);
  const porBanco = db.prepare(channel ? `
    SELECT COALESCE(NULLIF(trim(p.banco_o_medio), ''), 'Sin banco') AS banco, COALESCE(SUM(p.monto), 0) AS total
    FROM payments p
    JOIN reservations r ON r.id = p.reserva_id
    WHERE date(p.fecha_pago) >= date(@start) AND date(p.fecha_pago) < date(@end)
      AND r.origen_reserva = @channel
    GROUP BY COALESCE(NULLIF(trim(p.banco_o_medio), ''), 'Sin banco')
    ORDER BY total DESC
  ` : `
    SELECT COALESCE(NULLIF(trim(banco_o_medio), ''), 'Sin banco') AS banco, COALESCE(SUM(monto), 0) AS total
    FROM payments
    WHERE date(fecha_pago) >= date(@start) AND date(fecha_pago) < date(@end)
    GROUP BY COALESCE(NULLIF(trim(banco_o_medio), ''), 'Sin banco')
    ORDER BY total DESC
  `).all(baseParams);
  const porMetodo = db.prepare(channel ? `
    SELECT COALESCE(NULLIF(trim(p.metodo_pago), ''), 'Sin metodo') AS metodo, COALESCE(SUM(p.monto), 0) AS total
    FROM payments p
    JOIN reservations r ON r.id = p.reserva_id
    WHERE date(p.fecha_pago) >= date(@start) AND date(p.fecha_pago) < date(@end)
      AND r.origen_reserva = @channel
    GROUP BY COALESCE(NULLIF(trim(p.metodo_pago), ''), 'Sin metodo')
    ORDER BY total DESC
  ` : `
    SELECT COALESCE(NULLIF(trim(metodo_pago), ''), 'Sin metodo') AS metodo, COALESCE(SUM(monto), 0) AS total
    FROM payments
    WHERE date(fecha_pago) >= date(@start) AND date(fecha_pago) < date(@end)
    GROUP BY COALESCE(NULLIF(trim(metodo_pago), ''), 'Sin metodo')
    ORDER BY total DESC
  `).all(baseParams);
  const porEstadoPago = db.prepare(`
    SELECT estado_pago AS estado, COUNT(*) AS total
    FROM reservations
    WHERE date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
    GROUP BY estado_pago
    ORDER BY total DESC
  `).all(baseParams);
  const porEstadoReserva = db.prepare(`
    SELECT estado_reserva AS estado, COUNT(*) AS total
    FROM reservations
    WHERE date(fecha_ingreso) >= date(@start) AND date(fecha_ingreso) < date(@end)${reservationChannel}
    GROUP BY estado_reserva
    ORDER BY total DESC
  `).all(baseParams);
  const reservasConSaldoPeriodo = getReservations({ ...reservationFilters, saldo_pendiente: "1" }).slice(0, 10);
  const reservasSinComprobantePeriodo = getReservations({ ...reservationFilters, sin_comprobante: "1" }).slice(0, 10);
  const totalDisponibles = scalar("SELECT COUNT(*) AS value FROM rooms WHERE estado = 'disponible'", {});
  const diasPeriodo = Math.max(1, diffNights(start, safeEnd));
  const capacidadNoches = Math.max(1, totalDisponibles * diasPeriodo);
  const ocupacionPromedio = Math.min(100, (Number(nochesPeriodo || 0) / capacidadNoches) * 100);
  const resumenPorCanal = db.prepare(`
    SELECT
      origen_reserva AS origen,
      COUNT(*) AS reservas,
      COALESCE(SUM(total_pago), 0) AS ingresos,
      COALESCE(SUM(abono), 0) AS abonado,
      COALESCE(SUM(saldo), 0) AS saldo
    FROM reservations
    WHERE estado_reserva NOT IN ('cancelada')
      AND date(fecha_ingreso) >= date(@start)
      AND date(fecha_ingreso) < date(@end)
      AND origen_reserva IN ('airbnb', 'whatsapp')
    GROUP BY origen_reserva
  `).all({ start, end: safeEnd });
  const ingresosPorDia = db.prepare(`
    SELECT fecha_ingreso AS fecha, COALESCE(SUM(total_pago), 0) AS total
    FROM reservations
    WHERE estado_reserva NOT IN ('cancelada')
      AND date(fecha_ingreso) >= date(@start)
      AND date(fecha_ingreso) < date(@end)
      ${reservationChannel}
    GROUP BY fecha_ingreso
    ORDER BY fecha_ingreso
  `).all(baseParams);
  const reservasPorCanal = db.prepare(`
    SELECT origen_reserva AS canal, COUNT(*) AS total
    FROM reservations
    WHERE estado_reserva NOT IN ('cancelada')
      AND date(fecha_ingreso) >= date(@start)
      AND date(fecha_ingreso) < date(@end)
      AND origen_reserva IN ('airbnb', 'whatsapp')
    GROUP BY origen_reserva
  `).all({ start, end: safeEnd });
  const ocupacionPorDia = [];
  for (let cursor = start; cursor < safeEnd; cursor = addDays(cursor, 1)) {
    const next = addDays(cursor, 1);
    const occupied = scalar(`
      SELECT COUNT(DISTINCT rr.habitacion_id) AS value
      FROM reservation_rooms rr
      JOIN reservations r ON r.id = rr.reserva_id
      WHERE r.estado_reserva NOT IN ('cancelada')
        AND date(r.fecha_ingreso) < date(@next)
        AND date(CASE WHEN r.fecha_salida <= r.fecha_ingreso THEN date(r.fecha_ingreso, '+1 day') ELSE r.fecha_salida END) > date(@day)
        ${reservationChannelR}
    `, channel ? { day: cursor, next, channel } : { day: cursor, next });
    ocupacionPorDia.push({
      fecha: cursor,
      ocupadas: occupied,
      porcentaje: totalDisponibles ? Math.min(100, (occupied / totalDisponibles) * 100) : 0
    });
  }

  res.json({
    today,
    period_start: start,
    period_end: safeEnd,
    canal: channel || "todos",
    reservas_hoy: reservasHoy,
    reservas_periodo: reservasPeriodo,
    ingresos_estimados_mes: ingresosPeriodo,
    total_abonado_mes: abonadoPeriodo,
    saldo_periodo: saldoPeriodo,
    saldos_pendientes: saldosPendientes,
    habitaciones_ocupadas_hoy: ocupadasHoy,
    habitaciones_disponibles_hoy: Math.max(0, habitacionesDisponibles),
    habitaciones_bloqueadas: bloqueadasHoy,
    noches_periodo: nochesPeriodo,
    ticket_promedio: reservasPeriodo ? ingresosPeriodo / reservasPeriodo : 0,
    ocupacion_promedio: ocupacionPromedio,
    proximos_ingresos: proximosIngresos,
    proximas_salidas: proximasSalidas,
    reservas_con_saldo_periodo: reservasConSaldoPeriodo,
    reservas_sin_comprobante_periodo: reservasSinComprobantePeriodo,
    reservas_sin_comprobante: sinComprobante,
    reservas_con_saldo_pendiente: scalar(
      `SELECT COUNT(*) AS value FROM reservations WHERE saldo > 0 AND estado_reserva NOT IN ('cancelada')${reservationChannel}`,
      channel ? { channel } : {}
    ),
    reservas_con_alertas: conAlertas,
    resumen_por_canal: resumenPorCanal,
    ingresos_por_dia: ingresosPorDia,
    ocupacion_por_dia: ocupacionPorDia,
    reservas_por_canal: reservasPorCanal,
    controles_pendientes: {
      saldos: reservasConSaldoPeriodo.length,
      sin_comprobante: reservasSinComprobantePeriodo.length,
      alertas: conAlertas
    },
    total_por_banco_o_medio: porBanco,
    total_por_metodo_pago: porMetodo,
    reservas_por_estado_pago: porEstadoPago,
    reservas_por_estado_reserva: porEstadoReserva,
    promedio_diario_mes: ingresosPeriodo / diasPeriodo
  });
});

app.get("/api/alerts", (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, r.nombre_completo_huesped, r.numero_remision
    FROM alerts a
    LEFT JOIN reservations r ON r.id = a.reserva_id
    WHERE (@resuelta = '' OR a.resuelta = @resuelta)
    ORDER BY a.resuelta ASC, a.fecha_creacion DESC
  `).all({ resuelta: req.query.resuelta ?? "" });
  res.json(rows);
});

app.put("/api/alerts/:id/resolve", requireRole("admin", "recepcion"), (req, res) => {
  db.prepare("UPDATE alerts SET resuelta = ? WHERE id = ?").run(req.body.resuelta === false ? 0 : 1, Number(req.params.id));
  res.json(db.prepare("SELECT * FROM alerts WHERE id = ?").get(Number(req.params.id)));
});

const frontendOutCandidates = [
  path.resolve(process.cwd(), "frontend/out"),
  path.resolve(process.cwd(), "../frontend/out")
];
const frontendOut = frontendOutCandidates.find((candidate) => fs.existsSync(candidate));
if (frontendOut) {
  app.use(express.static(frontendOut));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(frontendOut, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = Number(err.status) >= 400 && Number(err.status) < 500 ? Number(err.status) : 500;
  const payload = {
    error: status >= 500 ? "Error interno del servidor." : (err.message || "La solicitud no es válida.")
  };
  if (status < 500 && err.details) payload.details = err.details;
  res.status(status).json(payload);
});

app.listen(port, host, () => {
  console.log(`Hotel Reservas API escuchando en http://${host}:${port}`);
  console.log(`SQLite: ${databasePath}`);
  console.log(`Uploads: ${uploadsDir}`);
  console.log(`Airbnb iCal sync: revision automatica cada ${airbnbSyncPollMinutes} minutos`);
});

setInterval(() => {
  syncDueAirbnbFeeds().catch((error) => {
    console.error("Error en sincronizacion automatica Airbnb:", error);
  });
}, airbnbSyncPollMinutes * 60 * 1000);

setTimeout(() => {
  syncDueAirbnbFeeds().catch((error) => {
    console.error("Error en sincronizacion inicial Airbnb:", error);
  });
}, 5000);

setTimeout(() => {
  runDueBackups().catch((error) => console.error("Error en backup programado:", error));
}, 10000);

setInterval(() => {
  runDueBackups().catch((error) => console.error("Error en backup programado:", error));
}, 60 * 60 * 1000);
