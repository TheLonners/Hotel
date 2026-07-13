const crypto = require("crypto");
const XLSX = require("xlsx");
const { db } = require("../database/db");
const { asInteger, normalizeRoomNightlyPrice, createRoom, getRoomByCode, updateRoom } = require("./reservations");
const { sortRooms } = require("./roomOrdering");
const { createBackup } = require("./backupService");

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
  foto_url: ["foto", "foto url", "url foto", "imagen", "imagen url", "url imagen"],
  airbnb_listing_id: ["airbnb listing id", "listing id", "id airbnb", "id listing airbnb", "id anuncio airbnb"],
  airbnb_ical_url: ["ical", "ical url", "url ical", "airbnb ical", "airbnb ical url", "airbnb_ical_url", "url ical airbnb"],
  airbnb_ical_activo: ["ical activo", "airbnb activo", "airbnb_ical_activo"],
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

function normalizeIdentity(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isValidHttpsUrl(value, hostnameSuffix = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!hostnameSuffix || url.hostname.toLowerCase().endsWith(hostnameSuffix));
  } catch (_error) {
    return false;
  }
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
  if (["bloqueada", "bloqueado", "blocked"].includes(text)) return "bloqueada";
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
  const sheetName = workbook.SheetNames.find((name) => normalizeIdentity(name) === "alojamientos");
  if (!sheetName) {
    const error = new Error("El archivo debe incluir una hoja llamada Alojamientos. Resumen no se importa.");
    error.status = 400;
    throw error;
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerRowIndex = findHeaderRow(rows);
  const headers = rows[headerRowIndex] || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const requiredFields = ["codigo_habitacion", "nombre_habitacion", "tipo_habitacion", "capacidad", "precio_base_noche", "estado", "airbnb_listing_id", "airbnb_ical_url", "airbnb_ical_activo"];
  const missingFields = requiredFields.filter((field) => !roomAliases[field].some((alias) => normalizedHeaders.includes(normalizeHeader(alias))));
  if (missingFields.length) {
    const error = new Error(`Faltan columnas obligatorias: ${missingFields.join(", ")}.`);
    error.status = 400;
    throw error;
  }
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
      const precioBase = priceDisablesRoom ? 0 : normalizeRoomNightlyPrice(rawPrecioBase, 0);
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
      const fotoUrl = cleanText(valueFromRow(source, "foto_url"));
      const airbnbListingId = cleanText(valueFromRow(source, "airbnb_listing_id"));
      const airbnbIcalUrl = cleanText(valueFromRow(source, "airbnb_ical_url"));
      const airbnbIcalActivo = asInteger(valueFromRow(source, "airbnb_ical_activo"), 0) ? 1 : 0;
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
          foto_url: fotoUrl || (existing ? existing.foto_url || "" : ""),
          airbnb_listing_id: airbnbListingId || (existing ? existing.airbnb_listing_id || "" : ""),
          airbnb_ical_url: airbnbIcalUrl || (existing ? existing.airbnb_ical_url || "" : ""),
          airbnb_ical_activo: airbnbIcalActivo,
          pendiente_revision: 0
        },
        action: existing ? "actualizar" : "crear",
        existingRoomId: existing ? existing.id : null,
        alerts,
        canImport: !alerts.some((alert) => alert.severidad === "alta")
      };
    });

  const existingByCode = new Map(db.prepare("SELECT * FROM rooms").all().map((room) => [normalizeIdentity(room.codigo_habitacion), room]));
  const listingOwners = new Map();
  const icalOwners = new Map();
  const nameOwners = new Map();
  const registerOwner = (owners, value, parsed, kind) => {
    const normalized = normalizeIdentity(value);
    if (!normalized) return;
    const owner = owners.get(normalized);
    if (owner && owner.data.codigo_habitacion !== parsed.data.codigo_habitacion) {
      parsed.alerts.push({ tipo_alerta: `${kind}_duplicado`, mensaje: `Fila ${parsed.rowNumber}: ${kind} repetido con la fila ${owner.rowNumber}.`, severidad: "alta" });
      owner.alerts.push({ tipo_alerta: `${kind}_duplicado`, mensaje: `Fila ${owner.rowNumber}: ${kind} repetido con la fila ${parsed.rowNumber}.`, severidad: "alta" });
    } else {
      owners.set(normalized, parsed);
    }
  };
  for (const parsed of parsedRows) {
    const { data } = parsed;
    const existing = existingByCode.get(normalizeIdentity(data.codigo_habitacion));
    const add = (tipo_alerta, mensaje, severidad = "alta") => parsed.alerts.push({ tipo_alerta, mensaje: `Fila ${parsed.rowNumber}: ${mensaje}`, severidad });
    if (!data.nombre_habitacion) add("nombre_vacio", "nombre obligatorio");
    if (!["Habitacion", "Apartamento", "DownHouse", "PentHouse"].includes(normalizeIdentity(data.tipo_habitacion).replace(/\s+/g, " ").replace("habitacion", "Habitacion").replace("apartamento", "Apartamento")) && !["habitacion", "apartamento", "downhouse", "penthouse"].includes(normalizeIdentity(data.tipo_habitacion))) add("tipo_invalido", "tipo de alojamiento no permitido");
    if (!Number.isInteger(Number(data.capacidad)) || Number(data.capacidad) < 1) add("capacidad_invalida", "capacidad debe ser un entero mayor que cero");
    if (!Number.isInteger(Number(data.camas)) || Number(data.camas) < 0 || !Number.isInteger(Number(data.sofa_cama)) || Number(data.sofa_cama) < 0) add("camas_invalidas", "camas y sofa cama deben ser enteros no negativos");
    if (!["disponible", "inactiva", "bloqueada", "mantenimiento"].includes(data.estado)) add("estado_invalido", "estado no permitido");
    if (!/^#[0-9a-f]{6}$/i.test(data.color_calendario || "")) add("color_invalido", "color invalido; se usará un color seguro", "media");
    if (data.foto_url && !isValidHttpsUrl(data.foto_url)) add("foto_url_invalida", "foto URL debe usar HTTPS", "media");
    if (data.airbnb_ical_activo && (!data.airbnb_listing_id || !data.airbnb_ical_url)) add("integracion_incompleta", "iCal activo requiere Listing ID y URL", "alta");
    if (data.airbnb_ical_url && !isValidHttpsUrl(data.airbnb_ical_url, "airbnb.com")) add("ical_invalido", "iCal debe ser una URL HTTPS de Airbnb", "alta");
    if (data.airbnb_ical_url && !/\.ics(?:\?|$)/i.test(data.airbnb_ical_url)) add("ical_invalido", "la URL iCal debe terminar en .ics", "alta");
    if (!data.precio_base_noche && data.estado === "disponible") add("precio_cero", "habitación disponible con precio cero", "media");
    if (data.capacidad && !data.camas && data.estado === "disponible") add("camas_cero", "habitación disponible sin camas", "media");
    const existingName = db.prepare("SELECT id, codigo_habitacion FROM rooms WHERE lower(nombre_habitacion) = lower(?) AND id <> ?").get(data.nombre_habitacion, existing?.id || 0);
    if (existingName) add("nombre_duplicado", "nombre ya existe en otra habitación");
    registerOwner(nameOwners, data.nombre_habitacion, parsed, "nombre");
    if (data.airbnb_listing_id) {
      const owner = db.prepare("SELECT id, codigo_habitacion FROM rooms WHERE airbnb_listing_id = ? AND id <> ?").get(data.airbnb_listing_id, existing?.id || 0);
      if (owner) add("listing_duplicado", "Listing ID ya pertenece a otra habitación");
      registerOwner(listingOwners, data.airbnb_listing_id, parsed, "listing");
    }
    if (data.airbnb_ical_url) {
      const owner = db.prepare("SELECT id, codigo_habitacion FROM rooms WHERE airbnb_ical_url = ? AND id <> ?").get(data.airbnb_ical_url, existing?.id || 0);
      if (owner) add("ical_duplicado", "URL iCal ya pertenece a otra habitación");
      registerOwner(icalOwners, data.airbnb_ical_url, parsed, "ical");
    }
    parsed.canImport = !parsed.alerts.some((alert) => alert.severidad === "alta");
  }

  const sessionId = crypto.randomUUID();
  const preview = {
    sessionId,
    fileName,
    sheetName,
    headerRow: headerRowIndex + 1,
    columns: headers.map(cleanText),
    rows: parsedRows,
    alerts: parsedRows.flatMap((row) => row.alerts),
    fileSha256: crypto.createHash("sha256").update(fileBuffer).digest("hex"),
    createdAt: Date.now()
  };
  roomImportSessions.set(sessionId, preview);
  return preview;
}

async function confirmRoomsImport(sessionId, options = {}) {
  const session = roomImportSessions.get(sessionId);
  if (!session) {
    const error = new Error("La previsualizacion expiro o no existe. Sube el archivo de habitaciones de nuevo.");
    error.status = 404;
    throw error;
  }

  const mode = options.mode === "valid_only" ? "valid_only" : "atomic";
  const blockingRows = session.rows.filter((row) => !row.canImport);
  if (mode === "atomic" && blockingRows.length) {
    const error = new Error(`La importación atómica tiene ${blockingRows.length} fila(s) bloqueante(s). Corrige el archivo antes de continuar.`);
    error.status = 422;
    error.details = { blockingRows: blockingRows.map((row) => row.rowNumber) };
    throw error;
  }

  const backup = await createBackup({ kind: "pre_import" });
  const batchResult = db.prepare(`
    INSERT INTO import_batches (kind, file_name, file_sha256, status, summary_json, backup_record_id)
    VALUES ('rooms', ?, ?, 'running', '{}', ?)
  `).run(session.fileName, session.fileSha256, backup.id);
  const batchId = Number(batchResult.lastInsertRowid);
  let created = 0;
  let updated = 0;
  const skipped = [];

  const transaction = db.transaction(() => {
    for (const parsed of session.rows) {
      if (!parsed.canImport) {
        skipped.push({ rowNumber: parsed.rowNumber, reason: "Alertas altas" });
        continue;
      }

      const existing = getRoomByCode(parsed.data.codigo_habitacion);
      if (existing) {
        updateRoom(existing.id, {
          ...parsed.data,
          color_calendario: parsed.data.color_calendario || existing.color_calendario,
          foto_url: parsed.data.foto_url || existing.foto_url || "",
          airbnb_listing_id: parsed.data.airbnb_listing_id || existing.airbnb_listing_id || "",
          airbnb_ical_url: parsed.data.airbnb_ical_url || existing.airbnb_ical_url || "",
          airbnb_ical_activo: parsed.data.airbnb_ical_activo
        });
        updated += 1;
      } else {
        createRoom(parsed.data);
        created += 1;
      }
    }
  });

  try {
    transaction();
  } catch (error) {
    db.prepare("UPDATE import_batches SET status = 'failed', completed_at = datetime('now'), summary_json = ? WHERE id = ?")
      .run(JSON.stringify({ error: error.message }), batchId);
    throw error;
  }
  roomImportSessions.delete(sessionId);

  const summary = {
    nombre_archivo: session.fileName,
    cantidad_filas: session.rows.length,
    habitaciones_creadas: created,
    habitaciones_actualizadas: updated,
    cantidad_alertas: session.alerts.length,
    omitidas: skipped,
    modo: mode,
    backup_previo_id: backup.id
  };
  db.prepare("UPDATE import_batches SET status = 'completed', completed_at = datetime('now'), summary_json = ? WHERE id = ?")
    .run(JSON.stringify(summary), batchId);

  return { ...summary, batchId };
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
    "Foto URL",
    "Airbnb Listing ID",
    "Airbnb iCal URL",
    "Airbnb iCal Activo",
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
      room.foto_url || "",
      room.airbnb_listing_id || "",
      room.airbnb_ical_url || "",
      Number(room.airbnb_ical_activo || 0) ? 1 : 0,
      room.descripcion || ""
    ])
    : [[1, "101", "Habitacion 101", "Habitación", "Doble", 2, 1, "Doble", 0, "PISCINA", "NO", "NO", 290000, "disponible", "#4f9da6", "https://ejemplo.com/foto.jpg", "1234567890", "https://www.airbnb.com/calendar/ical/1234567890.ics?t=token", 1, "Fila de ejemplo. Puedes borrarla."]];

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
    { wch: 44 },
    { wch: 24 },
    { wch: 72 },
    { wch: 18 },
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
    ["Foto URL", "URL de imagen principal de la habitacion o del anuncio Airbnb."],
    ["Airbnb iCal URL", "URL privada .ics de Airbnb. Si viene llena, el iCal queda activo."],
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
