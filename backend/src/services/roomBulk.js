const crypto = require("crypto");
const XLSX = require("xlsx");
const { db } = require("../database/db");
const { asInteger, asNumber, createRoom, getRoomByCode, updateRoom } = require("./reservations");
const { sortRooms } = require("./roomOrdering");

const roomImportSessions = new Map();

const roomAliases = {
  numero: ["no", "no.", "#", "numero", "n"],
  codigo_habitacion: ["codigo interno", "codigo", "código interno", "código", "habitacion", "habitación"],
  nombre_habitacion: ["nombre", "nombre habitacion", "nombre habitación", "alojamiento"],
  tipo_habitacion: ["tipo de alojamiento", "tipo alojamiento", "tipo_habitacion", "tipo habitación", "tipo"],
  acomodacion: ["acomodacion", "acomodación"],
  capacidad: ["capacidad de huespedes", "capacidad de huéspedes", "capacidad", "huespedes", "huéspedes"],
  camas: ["camas", "cantidad camas"],
  tipo_cama: ["tipo de cama", "tipo cama"],
  sofa_cama: ["sofa cama", "sofá cama"],
  tipo_vista: ["tipo de vista", "vista"],
  tina: ["tina"],
  jacuzzi_interno: ["jacuzzi interno", "jacuzzi"],
  precio_base_noche: ["valor base", "precio base", "precio_base_noche", "tarifa", "valor"],
  estado: ["estado"],
  color_calendario: ["color calendario", "color"],
  descripcion: ["descripcion", "descripción", "observaciones", "notas"]
};

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function findHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const normalized = row.map(normalizeHeader).join("|");
    let score = 0;
    if (normalized.includes("codigo")) score += 4;
    if (normalized.includes("tipo")) score += 1;
    if (normalized.includes("capacidad")) score += 1;
    if (normalized.includes("valor")) score += 1;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function valueFromRow(rowObject, field) {
  const normalized = {};
  Object.keys(rowObject).forEach((key) => {
    normalized[normalizeHeader(key)] = rowObject[key];
  });
  for (const alias of roomAliases[field]) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized[key];
  }
  return "";
}

function normalizeStatus(value) {
  const text = cleanText(value).toLowerCase();
  if (["mantenimiento", "mant", "maintenance"].includes(text)) return "mantenimiento";
  if (isDisabledText(value) || ["inactiva", "inactivo", "inactive", "desactivada"].includes(text)) return "inactiva";
  return "disponible";
}

function isDisabledText(value) {
  const text = normalizeHeader(value).replace(/\s+/g, "");
  if (!text) return false;
  return [
    "deshabilitado",
    "deshabilitada",
    "desahibilitado",
    "desahibilitada",
    "desabilitado",
    "desabilitada",
    "inhabilitado",
    "inhabilitada",
    "disabled",
    "inactivo",
    "inactiva"
  ].includes(text) || text.includes("deshabil") || text.includes("desahibil") || text.includes("desabil");
}

function normalizeYesNo(value) {
  const text = cleanText(value).toUpperCase();
  if (["SI", "SÍ", "YES", "TRUE", "1", "OK", "X"].includes(text)) return "SI";
  if (["NO", "FALSE", "0"].includes(text)) return "NO";
  return cleanText(value);
}

function buildDescription(data) {
  const parts = [];
  if (data.camas) parts.push(`${data.camas} cama(s)`);
  if (data.tipo_cama) parts.push(`Tipo cama: ${data.tipo_cama}`);
  if (data.sofa_cama) parts.push(`Sofa cama: ${data.sofa_cama}`);
  if (data.tipo_vista) parts.push(`Vista: ${data.tipo_vista}`);
  if (data.tina) parts.push(`Tina: ${data.tina}`);
  if (data.jacuzzi_interno) parts.push(`Jacuzzi interno: ${data.jacuzzi_interno}`);
  return parts.join(" | ");
}

function rowObjectFromArray(headers, row) {
  const object = {};
  headers.forEach((header, index) => {
    if (cleanText(header)) object[cleanText(header)] = row[index];
  });
  return object;
}

function parseRoomsWorkbook(fileBuffer, fileName) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerRowIndex = findHeaderRow(rows);
  const headers = rows[headerRowIndex] || [];
  const seenCodes = new Set();

  const parsedRows = rows.slice(headerRowIndex + 1)
    .map((row, index) => ({ row, rowNumber: headerRowIndex + index + 2 }))
    .filter(({ row }) => row.some((value) => cleanText(value)))
    .map(({ row, rowNumber }) => {
      const source = rowObjectFromArray(headers, row);
      const codigo = cleanText(valueFromRow(source, "codigo_habitacion"));
      const tipo = cleanText(valueFromRow(source, "tipo_habitacion"));
      const acomodacion = cleanText(valueFromRow(source, "acomodacion"));
      const capacidad = asInteger(valueFromRow(source, "capacidad"), 2);
      const camas = asInteger(valueFromRow(source, "camas"), 0);
      const tipoCama = cleanText(valueFromRow(source, "tipo_cama"));
      const sofaCama = asInteger(valueFromRow(source, "sofa_cama"), 0);
      const tipoVista = cleanText(valueFromRow(source, "tipo_vista"));
      const tina = normalizeYesNo(valueFromRow(source, "tina"));
      const jacuzziInterno = normalizeYesNo(valueFromRow(source, "jacuzzi_interno"));
      const rawPrecioBase = valueFromRow(source, "precio_base_noche");
      const priceDisablesRoom = isDisabledText(rawPrecioBase);
      const precioBase = priceDisablesRoom ? 0 : asNumber(rawPrecioBase, 0);
      const nombre = cleanText(valueFromRow(source, "nombre_habitacion")) || [tipo, acomodacion, codigo].filter(Boolean).join(" ");
      const descripcion = cleanText(valueFromRow(source, "descripcion")) || buildDescription({
        camas,
        tipo_cama: tipoCama,
        sofa_cama: sofaCama,
        tipo_vista: tipoVista,
        tina,
        jacuzzi_interno: jacuzziInterno
      });
      const estado = priceDisablesRoom ? "inactiva" : normalizeStatus(valueFromRow(source, "estado"));
      const color = cleanText(valueFromRow(source, "color_calendario"));
      const existing = codigo ? getRoomByCode(codigo) : null;
      const alerts = [];
      const lowerCode = codigo.toLowerCase();

      const addAlert = (tipo_alerta, mensaje, severidad = "media") => {
        alerts.push({ tipo_alerta, mensaje: `Fila ${rowNumber}: ${mensaje}`, severidad });
      };

      if (!codigo) addAlert("codigo_habitacion_vacio", "codigo de habitacion vacio", "alta");
      if (codigo && seenCodes.has(lowerCode)) addAlert("codigo_habitacion_duplicado_archivo", `codigo ${codigo} repetido dentro del archivo`, "alta");
      if (codigo) seenCodes.add(lowerCode);
      if (priceDisablesRoom) addAlert("habitacion_deshabilitada", `habitacion ${codigo} marcada como inactiva desde valor base`, "baja");
      if (!precioBase && estado !== "inactiva") addAlert("precio_base_vacio", "valor base vacio o cero", "baja");
      if (!capacidad) addAlert("capacidad_vacia", "capacidad vacia o cero; se usara 2", "baja");

      return {
        rowNumber,
        source,
        data: {
          codigo_habitacion: codigo,
          nombre_habitacion: nombre || codigo,
          tipo_habitacion: tipo,
          descripcion,
          acomodacion,
          capacidad,
          camas,
          tipo_cama: tipoCama,
          sofa_cama: sofaCama,
          tipo_vista: tipoVista,
          tina,
          jacuzzi_interno: jacuzziInterno,
          precio_base_noche: precioBase,
          estado,
          color_calendario: color || (existing ? existing.color_calendario : ""),
          pendiente_revision: 0
        },
        action: existing ? "actualizar" : "crear",
        existingRoomId: existing ? existing.id : null,
        alerts,
        canImport: !alerts.some((alert) => alert.severidad === "alta")
      };
    });

  const sessionId = crypto.randomUUID();
  const preview = {
    sessionId,
    fileName,
    sheetName,
    headerRow: headerRowIndex + 1,
    columns: headers.map(cleanText),
    rows: parsedRows,
    alerts: parsedRows.flatMap((row) => row.alerts),
    createdAt: Date.now()
  };
  roomImportSessions.set(sessionId, preview);
  return preview;
}

function confirmRoomsImport(sessionId, options = {}) {
  const session = roomImportSessions.get(sessionId);
  if (!session) {
    const error = new Error("La previsualizacion expiro o no existe. Sube el archivo de habitaciones de nuevo.");
    error.status = 404;
    throw error;
  }

  let created = 0;
  let updated = 0;
  const skipped = [];

  const transaction = db.transaction(() => {
    for (const parsed of session.rows) {
      if (!parsed.canImport && !options.force) {
        skipped.push({ rowNumber: parsed.rowNumber, reason: "Alertas altas" });
        continue;
      }

      const existing = getRoomByCode(parsed.data.codigo_habitacion);
      if (existing) {
        updateRoom(existing.id, {
          ...parsed.data,
          color_calendario: parsed.data.color_calendario || existing.color_calendario
        });
        updated += 1;
      } else {
        createRoom(parsed.data);
        created += 1;
      }
    }
  });

  transaction();
  roomImportSessions.delete(sessionId);

  return {
    nombre_archivo: session.fileName,
    cantidad_filas: session.rows.length,
    habitaciones_creadas: created,
    habitaciones_actualizadas: updated,
    cantidad_alertas: session.alerts.length,
    omitidas: skipped
  };
}

function buildRoomsWorkbook() {
  const headers = [
    "No.",
    "Código Interno",
    "Nombre",
    "Tipo de Alojamiento",
    "Acomodación",
    "Capacidad de Huéspedes",
    "Camas",
    "Tipo de cama",
    "Sofa cama",
    "Tipo de Vista",
    "Tina",
    "Jacuzzi Interno",
    "Valor Base",
    "Estado",
    "Color Calendario",
    "Descripción"
  ];

  const rooms = sortRooms(db.prepare("SELECT * FROM rooms").all());
  const rows = rooms.length
    ? rooms.map((room, index) => [
      index + 1,
      room.codigo_habitacion,
      room.nombre_habitacion,
      room.tipo_habitacion,
      room.acomodacion || "",
      room.capacidad,
      room.camas || 0,
      room.tipo_cama || "",
      room.sofa_cama || 0,
      room.tipo_vista || "",
      room.tina || "",
      room.jacuzzi_interno || "",
      room.estado === "inactiva" ? "Deshabilitado" : room.precio_base_noche,
      room.estado,
      room.color_calendario,
      room.descripcion || ""
    ])
    : [[1, "101", "Habitacion 101", "Habitación", "Doble", 2, 1, "Doble", 0, "PISCINA", "NO", "NO", 290000, "disponible", "#4f9da6", "Fila de ejemplo. Puedes borrarla."]];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["Informacion General Alojamientos"], headers, ...rows]);
  sheet["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 10 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 44 }
  ];
  for (let row = 3; row <= rows.length + 2; row += 1) {
    const priceCell = `M${row}`;
    if (sheet[priceCell]) sheet[priceCell].z = "#,##0";
  }

  const guide = XLSX.utils.aoa_to_sheet([
    ["Campo", "Uso"],
    ["Código Interno", "Obligatorio. Es la llave unica. Si ya existe, se actualiza; si no existe, se crea."],
    ["Valor Base", "Precio base por noche. Puedes descargar este archivo, cambiar precios y volverlo a importar."],
    ["Estado", "Usa disponible, mantenimiento o inactiva."],
    ["Color Calendario", "Color hexadecimal opcional, por ejemplo #4f9da6."],
    ["Varias importaciones", "No duplica habitaciones: actualiza usando Código Interno."]
  ]);
  guide["!cols"] = [{ wch: 22 }, { wch: 90 }];

  XLSX.utils.book_append_sheet(workbook, sheet, "Alojamientos");
  XLSX.utils.book_append_sheet(workbook, guide, "Guia");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

module.exports = {
  buildRoomsWorkbook,
  confirmRoomsImport,
  parseRoomsWorkbook,
  roomImportSessions
};
