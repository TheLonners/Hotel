const crypto = require("crypto");
const { db } = require("../database/db");
const { recordAudit } = require("./audit");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ROLES = ["admin", "recepcion", "aseo", "consulta"];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sign(payload) {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET o ADMIN_PASSWORD es obligatorio para las sesiones.");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role, active: Boolean(user.active) };
}

function issueSession(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSession(token) {
  if (!sessionSecret()) return null;
  const [payload, signature] = String(token || "").split(".");
  try {
    if (!payload || !signature) return null;
    const received = Buffer.from(signature);
    const expected = Buffer.from(sign(payload));
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!body.sub || !body.exp || body.exp < Date.now()) return null;
    return db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(Number(body.sub));
  } catch (_error) {
    return null;
  }
}

function ensureBootstrapAdmin() {
  if (db.prepare("SELECT id FROM users LIMIT 1").get()) return;
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  if (!password) return;
  const info = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hashPassword(password));
  recordAudit({ actorUserId: info.lastInsertRowid, action: "bootstrap", entityType: "user", entityId: info.lastInsertRowid });
}

function login(username, password) {
  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1").get(String(username || "").trim());
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  recordAudit({ actorUserId: user.id, action: "login", entityType: "user", entityId: user.id });
  return { token: issueSession(user), user: publicUser(user) };
}

function createUser(input, actorUserId) {
  const role = ROLES.includes(input.role) ? input.role : "consulta";
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (username.length < 3 || password.length < 10) {
    const error = new Error("Usuario minimo de 3 caracteres y clave minima de 10 caracteres.");
    error.status = 400;
    throw error;
  }
  const info = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, hashPassword(password), role);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  recordAudit({ actorUserId, action: "create", entityType: "user", entityId: user.id, details: { username, role } });
  return publicUser(user);
}

module.exports = { ROLES, createUser, ensureBootstrapAdmin, issueSession, login, publicUser, readSession };
