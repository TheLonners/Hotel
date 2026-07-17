const crypto = require("crypto");
const XLSX = require("xlsx");
const { db } = require("../database/db");
const {
  asBoolean,
  asInteger,
  asNumber,
  createReservation,
  createRoom,
  getRoomByCode
} = require("./reservations");
const { compareDates, diffNights, parseDateValue } = require("./dates");

const sessions = new Map();

const aliases = {
  numero_interno: ["#", "numero", "n", "no"],
  nombre_completo_huesped: ["nombre", "nombrecompleto", "huesped", "cliente"],
  correo: ["email", "correo", "correoelectronico"],
  telefono: ["telefono", "teléfono", "telfono", "celular", "phone"],
  cedula: ["cc", "cedula", "cédula", "documento"],
  direccion: ["direccion", "dirección", "address"],
  cantidad_huespedes: ["huespedes", "huéspedes", "huspedes", "cantidadhuespedes", "personas"],
  codigo_habitacion_original: ["habitacion", "habitación", "habitacin", "habitaciones", "room"],
  fecha_ingreso: ["fechaingreso", "fechaentrada", "ingreso", "checkin"],
  fecha_salida: ["fechasalida", "salida", "checkout"],
  valor_base: ["valor", "valornoche", "tarifa"],
  total_pago: ["total", "totalpago"],
  abono: ["abono", "anticipo"],
  saldo: ["saldo"],
  fecha_abono: ["fechaabono", "fechaanticipo"],
  banco_o_medio_pago: ["banco", "medio", "mediopago", "bancoomedio"],
  noches: ["noches", "noche"],
  numero_remision: ["nremision", "noremission", "noremision", "remision", "remisión"],
  airbnb_ok: ["airbnb"],
  whatsapp_ok: ["what", "whatsapp", "wha"],
  siigo_ok: ["siigo"],
  queo_ok: ["queo"],
  observaciones: ["observaciones", "observacion", "notas", "nota"]
};

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, "");
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pick(row, field) {
  const normalized = {};
  for (const key of Object.keys(row)) {
    normalized[normalizeHeader(key)] = row[key];
  }
  for (const alias of aliases[field]) {
    const normalizedAlias = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(normalized, normalizedAlias)) return normalized[normalizedAlias];
  }
  return "";
}

function splitRoomCodes(value) {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .replace(/\s+(y|e|and)\s+/gi, ",")
    .replace(/[;|+&]/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLikelyExcelSerial(value) {
  if (typeof value === "number") return value > 20000 && value < 80000;
  return /^\d+(\.\d+)?$/.test(String(value || "").trim()) && Number(value) > 20000;
}

function validateEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRow(row, index, seenRemisiones) {
  const rawIngreso = pick(row, "fecha_ingreso");
  const rawSalida = pick(row, "fecha_salida");
  const rawFechaAbono = pick(row, "fecha_abono");
  const fechaIngreso = parseDateValue(rawIngreso);
  const fechaSalida = parseDateValue(rawSalida);
  const fechaAbono = parseDateValue(rawFechaAbono);
  const roomCodes = splitRoomCodes(pick(row, "codigo_habitacion_original"));
  const total = asNumber(pick(row, "total_pago"), 0);
  const valor = asNumber(pick(row, "valor_base"), 0);
  const abono = asNumber(pick(row, "abono"), 0);
  const saldo = asNumber(pick(row, "saldo"), Math.max(0, total - abono));
  const noches = pick(row, "noches") !== "" ? asInteger(pick(row, "noches"), 0) : Math.max(0, diffNights(fechaIngreso, fechaSalida));
  const remision = cleanText(pick(row, "numero_remision"));
  const correo = cleanText(pick(row, "correo"));
  const telefono = cleanText(pick(row, "telefono"));
  const cedula = cleanText(pick(row, "cedula"));
  const alerts = [];

  const addAlert = (tipo_alerta, mensaje, severidad = "media") => {
    alerts.push({ tipo_alerta, mensaje: `Fila ${index + 2}: ${mensaje}`, severidad });
  };

  if (!fechaIngreso) addAlert("fecha_ingreso_invalida", "fecha de ingreso invalida o vacia", "alta");
  if (!fechaSalida) addAlert("fecha_salida_invalida", "fecha de salida invalida o vacia", "alta");
  if (fechaIngreso && fechaSalida && compareDates(fechaSalida, fechaIngreso) < 0) {
    addAlert("fecha_salida_menor", "fecha de salida menor que fecha de ingreso", "alta");
  }
  if (fechaIngreso && fechaSalida && compareDates(fechaSalida, fechaIngreso) === 0) {
    addAlert("fecha_ingreso_igual_salida", "ingreso y salida son el mismo dia; se importara como day_use", "media");
  }
  if (isLikelyExcelSerial(rawIngreso) || isLikelyExcelSerial(rawSalida) || isLikelyExcelSerial(rawFechaAbono)) {
    addAlert("fecha_serial_excel", "se detecto fecha como serial de Excel y fue convertida", "baja");
  }
  if (!roomCodes.length) addAlert("habitacion_vacia", "habitacion vacia", "alta");
  if (roomCodes.length > 1) addAlert("habitacion_multiple", `reserva con varias habitaciones: ${roomCodes.join(", ")}`, "baja");
  for (const code of roomCodes) {
    if (!getRoomByCode(code)) addAlert("habitacion_no_encontrada", `habitacion ${code} no existe; se creara pendiente de revisar`, "media");
  }
  if (remision) {
    const existing = db.prepare("SELECT id FROM reservations WHERE numero_remision = ? LIMIT 1").get(remision);
    if (existing || seenRemisiones.has(remision.toLowerCase())) {
      addAlert("remision_duplicada", `numero de remision duplicado: ${remision}`, "media");
    }
    seenRemisiones.add(remision.toLowerCase());
  }
  if (total && abono >= 0 && Math.abs(saldo - (total - abono)) > 1) {
    addAlert("saldo_no_coincide", "saldo no coincide con total menos abono", "media");
  }
  if (valor && noches && total && Math.abs(total - (valor * noches)) > 1) {
    addAlert("total_no_coincide", "total no coincide con noches por valor", "baja");
  }
  if (!validateEmail(correo)) addAlert("correo_invalido", `correo con formato irregular: ${correo}`, "baja");
  if (telefono && /[^0-9+\s().-]/.test(telefono)) addAlert("telefono_irregular", "telefono con formato irregular", "baja");
  if (cedula && /[^0-9a-zA-Z\s.-]/.test(cedula)) addAlert("cedula_irregular", "cedula con caracteres especiales", "baja");

  const payload = {
    numero_interno: cleanText(pick(row, "numero_interno")),
    numero_remision: remision,
    nombre_completo_huesped: cleanText(pick(row, "nombre_completo_huesped")),
    correo,
    telefono,
    cedula,
    direccion: cleanText(pick(row, "direccion")),
    cantidad_huespedes: asInteger(pick(row, "cantidad_huespedes"), 1),
    codigo_habitacion_original: cleanText(pick(row, "codigo_habitacion_original")),
    roomCodes,
    fecha_ingreso: fechaIngreso,
    fecha_salida: fechaSalida,
    noches,
    tipo_estadia: fechaIngreso && fechaSalida && compareDates(fechaSalida, fechaIngreso) === 0 ? "day_use" : "noche",
    valor_base: valor,
    total_pago: total || (valor * noches),
    abono,
    saldo,
    abono_importado: abono,
    saldo_importado: saldo,
    fecha_abono: fechaAbono,
    banco_o_medio_pago: cleanText(pick(row, "banco_o_medio_pago")),
    metodo_pago: cleanText(pick(row, "banco_o_medio_pago")).toLowerCase() || "transferencia",
    estado_reserva: "confirmada",
    origen_reserva: asBoolean(pick(row, "airbnb_ok")) ? "airbnb" : "whatsapp",
    airbnb_ok: asBoolean(pick(row, "airbnb_ok")),
    whatsapp_ok: asBoolean(pick(row, "whatsapp_ok")),
    siigo_ok: asBoolean(pick(row, "siigo_ok")),
    queo_ok: asBoolean(pick(row, "queo_ok")),
    observaciones: cleanText(pick(row, "observaciones")),
    total_manual: total && valor && noches && Math.abs(total - (valor * noches)) > 1
  };

  if (!payload.nombre_completo_huesped) {
    addAlert("nombre_vacio", "nombre de huesped vacio", "alta");
  }

  return {
    rowNumber: index + 2,
    raw: row,
    data: payload,
    alerts,
    canImport: !alerts.some((alert) => alert.severidad === "alta")
  };
}

function parseWorkbook(fileBuffer, fileName) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  const seenRemisiones = new Set();
  const parsedRows = rows.map((row, index) => normalizeRow(row, index, seenRemisiones));
  const sessionId = crypto.randomUUID();
  const payload = {
    sessionId,
    fileName,
    sheetName,
    columns: rows.length ? Object.keys(rows[0]) : [],
    rows: parsedRows,
    alerts: parsedRows.flatMap((row) => row.alerts),
    createdAt: Date.now()
  };
  sessions.set(sessionId, payload);
  return payload;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session;
}

function confirmImport(sessionId, options = {}) {
  const session = getSession(sessionId);
  if (!session) {
    const error = new Error("La previsualizacion expiro o no existe. Sube el archivo de nuevo.");
    error.status = 404;
    throw error;
  }

  const importInfo = db.prepare(`
    INSERT INTO imports (nombre_archivo, cantidad_filas, cantidad_reservas_creadas, cantidad_alertas, estado, resumen)
    VALUES (?, ?, 0, ?, 'procesando', ?)
  `).run(session.fileName, session.rows.length, session.alerts.length, JSON.stringify({ sheetName: session.sheetName }));
  const importId = importInfo.lastInsertRowid;
  let created = 0;
  const skipped = [];

  for (const parsed of session.rows) {
    if (!parsed.canImport && !options.force) {
      skipped.push({ rowNumber: parsed.rowNumber, reason: "Alertas altas" });
      continue;
    }
    try {
      const roomAssignments = parsed.data.roomCodes.map((code) => {
        const existing = getRoomByCode(code);
        const room = existing || createRoom({
          codigo_habitacion: code,
          nombre_habitacion: `Habitacion ${code}`,
          tipo_habitacion: "",
          descripcion: "Creada automaticamente desde importacion",
          capacidad: Math.max(parsed.data.cantidad_huespedes || 1, 1),
          precio_base_noche: parsed.data.valor_base || 0,
          estado: "disponible",
          pendiente_revision: 1
        });
        return {
          habitacion_id: room.id,
          codigo_habitacion_original: code,
          precio_asignado: parsed.data.valor_base,
          notas: existing ? "" : "Creada automaticamente desde Excel"
        };
      });

      const reservation = createReservation({
        ...parsed.data,
        roomAssignments,
        initial_payment_note: "Abono historico importado desde Excel"
      });
      created += 1;
      for (const alert of parsed.alerts) {
        db.prepare(`
          INSERT INTO alerts (reserva_id, importacion_id, tipo_alerta, mensaje, severidad)
          VALUES (?, ?, ?, ?, ?)
        `).run(reservation.id, importId, alert.tipo_alerta, alert.mensaje, alert.severidad);
      }
    } catch (error) {
      skipped.push({ rowNumber: parsed.rowNumber, reason: error.message });
      db.prepare(`
        INSERT INTO alerts (importacion_id, tipo_alerta, mensaje, severidad)
        VALUES (?, 'importacion_no_creada', ?, 'alta')
      `).run(importId, `Fila ${parsed.rowNumber}: ${error.message}`);
    }
  }

  const alertCount = db.prepare("SELECT COUNT(*) AS total FROM alerts WHERE importacion_id = ?").get(importId).total;
  db.prepare(`
    UPDATE imports
    SET cantidad_reservas_creadas = ?,
        cantidad_alertas = ?,
        estado = 'completada',
        resumen = ?
    WHERE id = ?
  `).run(created, alertCount, JSON.stringify({ skipped, sheetName: session.sheetName }), importId);

  sessions.delete(sessionId);
  return db.prepare("SELECT * FROM imports WHERE id = ?").get(importId);
}

module.exports = {
  confirmImport,
  parseWorkbook
};
