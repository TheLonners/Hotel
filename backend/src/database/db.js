const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { LEGACY_ROOM_CODES, VERIFIED_AIRBNB_LISTINGS, HISTORICAL_AIRBNB_ALIASES } = require("../data/airbnbListingDirectory");
require("dotenv").config();

const projectRoot = path.resolve(__dirname, "../../..");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(projectRoot, process.env.DATABASE_PATH)
  : path.join(projectRoot, "data", "hotel.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

let transactionDepth = 0;

db.transaction = function transaction(handler) {
  return (...args) => {
    const nested = transactionDepth > 0;
    if (!nested) db.exec("BEGIN IMMEDIATE");
    transactionDepth += 1;
    try {
      const result = handler(...args);
      transactionDepth -= 1;
      if (!nested) db.exec("COMMIT");
      return result;
    } catch (error) {
      transactionDepth -= 1;
      if (!nested) db.exec("ROLLBACK");
      throw error;
    }
  };
};

function cleanText(value) {
  return String(value || "").trim();
}

function splitClientName(fullName, firstName = "", lastName = "") {
  const nameParts = cleanText(firstName).split(/\s+/).filter(Boolean);
  const lastParts = cleanText(lastName).split(/\s+/).filter(Boolean);
  const fullParts = cleanText(fullName).split(/\s+/).filter(Boolean);

  if (!nameParts.length && !lastParts.length && fullParts.length) {
    if (fullParts.length === 1) {
      nameParts.push(fullParts[0]);
    } else if (fullParts.length === 2) {
      nameParts.push(fullParts[0]);
      lastParts.push(fullParts[1]);
    } else if (fullParts.length === 3) {
      nameParts.push(fullParts[0], fullParts[1]);
      lastParts.push(fullParts[2]);
    } else {
      nameParts.push(fullParts[0], fullParts[1]);
      lastParts.push(fullParts[fullParts.length - 2], fullParts[fullParts.length - 1]);
    }
  }

  return {
    primer_nombre: nameParts[0] || "",
    segundo_nombre: nameParts.slice(1).join(" "),
    primer_apellido: lastParts[0] || "",
    segundo_apellido: lastParts.slice(1).join(" "),
    nombre_completo: cleanText(fullName) || [...nameParts, ...lastParts].join(" ")
  };
}

function backfillClientsFromReservations() {
  const reservations = db.prepare(`
    SELECT cedula, nombre_completo_huesped, nombre_huesped, apellido_huesped, correo, telefono, direccion
    FROM reservations
    WHERE trim(coalesce(cedula, '')) <> ''
    ORDER BY datetime(coalesce(fecha_actualizacion, fecha_creacion, '1970-01-01')) DESC, id DESC
  `).all();
  const seen = new Set();
  const upsert = db.prepare(`
    INSERT INTO clients (
      cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      nombre_completo, correo, telefono, direccion, fecha_actualizacion
    )
    VALUES (
      @cedula, @primer_nombre, @segundo_nombre, @primer_apellido, @segundo_apellido,
      @nombre_completo, @correo, @telefono, @direccion, datetime('now')
    )
    ON CONFLICT(cedula) DO UPDATE SET
      primer_nombre = excluded.primer_nombre,
      segundo_nombre = excluded.segundo_nombre,
      primer_apellido = excluded.primer_apellido,
      segundo_apellido = excluded.segundo_apellido,
      nombre_completo = excluded.nombre_completo,
      correo = excluded.correo,
      telefono = excluded.telefono,
      direccion = excluded.direccion,
      fecha_actualizacion = datetime('now')
  `);

  for (const reservation of reservations) {
    const cedula = cleanText(reservation.cedula);
    if (!cedula || seen.has(cedula)) continue;
    seen.add(cedula);
    upsert.run({
      cedula,
      ...splitClientName(reservation.nombre_completo_huesped, reservation.nombre_huesped, reservation.apellido_huesped),
      correo: cleanText(reservation.correo),
      telefono: cleanText(reservation.telefono),
      direccion: cleanText(reservation.direccion)
    });
  }
}

function normalizeAirbnbListingName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(habitacion|room|airbnb|anuncio|listing)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function syncVerifiedAirbnbListingDirectory() {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version = 3").get()) return;

  const aliasColumns = db.prepare("PRAGMA table_info(airbnb_listing_aliases)").all().map((column) => column.name);
  const addAliasColumn = (name, definition) => {
    if (!aliasColumns.includes(name)) db.exec(`ALTER TABLE airbnb_listing_aliases ADD COLUMN ${name} ${definition}`);
  };
  addAliasColumn("listing_id", "TEXT DEFAULT ''");
  addAliasColumn("verified_with_chrome", "INTEGER NOT NULL DEFAULT 0");
  addAliasColumn("verified_at", "TEXT");
  addAliasColumn("notes", "TEXT DEFAULT ''");

  db.transaction(() => {
    const findRoom = db.prepare("SELECT * FROM rooms WHERE lower(codigo_habitacion) = lower(?) LIMIT 1");
    const updateRoom = db.prepare("UPDATE rooms SET codigo_habitacion = ?, nombre_habitacion = ?, fecha_actualizacion = datetime('now') WHERE id = ?");
    const createRoom = db.prepare("INSERT INTO rooms (codigo_habitacion, nombre_habitacion, tipo_habitacion, capacidad, estado, pendiente_revision) VALUES (?, ?, 'Habitación', 2, 'disponible', 1)");
    const upsertAlias = db.prepare(`
      INSERT INTO airbnb_listing_aliases (room_id, listing_id, listing_name_original, listing_name_normalized, source, verified_with_chrome, verified_at, is_active, notes)
      VALUES (?, ?, ?, ?, 'CHROME_VERIFIED', 1, datetime('now'), 1, ?)
      ON CONFLICT(room_id, listing_name_normalized) DO UPDATE SET
        listing_id = excluded.listing_id,
        listing_name_original = excluded.listing_name_original,
        source = excluded.source,
        verified_with_chrome = excluded.verified_with_chrome,
        verified_at = excluded.verified_at,
        is_active = excluded.is_active,
        notes = excluded.notes
    `);

    for (const listing of VERIFIED_AIRBNB_LISTINGS) {
      const room = findRoom.get(listing.listingId) || findRoom.get(LEGACY_ROOM_CODES[listing.listingId] || "");
      const roomId = room ? room.id : Number(createRoom.run(listing.listingId, listing.name).lastInsertRowid);
      if (room) updateRoom.run(listing.listingId, listing.name, roomId);
      upsertAlias.run(roomId, listing.listingId, listing.name, normalizeAirbnbListingName(listing.name), "Verificado en el calendario de Airbnb (Chrome) el 2026-07-13.");
    }
    db.exec("INSERT INTO schema_migrations (version) VALUES (3)");
  })();
}

function syncRenamedAirbnbListingDirectory() {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version = 5").get()) return;

  db.transaction(() => {
    const findRoom = db.prepare("SELECT * FROM rooms WHERE lower(codigo_habitacion) = lower(?) LIMIT 1");
    const updateRoom = db.prepare("UPDATE rooms SET nombre_habitacion = ?, fecha_actualizacion = datetime('now') WHERE id = ?");
    const findAlias = db.prepare(`
      SELECT id FROM airbnb_listing_aliases
      WHERE room_id = ? AND lower(trim(listing_id)) = lower(trim(?))
      LIMIT 1
    `);
    const updateAlias = db.prepare(`
      UPDATE airbnb_listing_aliases
      SET listing_name_original = ?, listing_name_normalized = ?, source = 'AIRBNB_RENAMED',
          verified_with_chrome = 1, verified_at = datetime('now'), is_active = 1, notes = ?
      WHERE id = ?
    `);
    const insertAlias = db.prepare(`
      INSERT INTO airbnb_listing_aliases
        (room_id, listing_id, listing_name_original, listing_name_normalized, source, verified_with_chrome, verified_at, is_active, notes)
      VALUES (?, ?, ?, ?, 'AIRBNB_RENAMED', 1, datetime('now'), 1, ?)
    `);
    const findAliasByName = db.prepare(`
      SELECT id FROM airbnb_listing_aliases
      WHERE room_id = ? AND listing_name_normalized = ?
      LIMIT 1
    `);
    const updateHistoricalAlias = db.prepare(`
      UPDATE airbnb_listing_aliases
      SET listing_name_original = ?, source = 'AIRBNB_HISTORY', is_active = 1, notes = ?
      WHERE id = ?
    `);
    const insertHistoricalAlias = db.prepare(`
      INSERT INTO airbnb_listing_aliases
        (room_id, listing_id, listing_name_original, listing_name_normalized, source, verified_with_chrome, verified_at, is_active, notes)
      VALUES (?, '', ?, ?, 'AIRBNB_HISTORY', 0, NULL, 1, ?)
    `);
    const note = "Nombre diferenciado por el operador en Airbnb el 2026-07-13.";

    for (const listing of VERIFIED_AIRBNB_LISTINGS) {
      const room = findRoom.get(listing.listingId);
      if (!room) continue;
      const normalizedName = normalizeAirbnbListingName(listing.name);
      updateRoom.run(listing.name, room.id);
      const existingAlias = findAlias.get(room.id, listing.listingId);
      if (existingAlias) {
        updateAlias.run(listing.name, normalizedName, note, existingAlias.id);
      } else {
        insertAlias.run(room.id, listing.listingId, listing.name, normalizedName, note);
      }
    }

    for (const alias of HISTORICAL_AIRBNB_ALIASES) {
      const room = findRoom.get(alias.listingId);
      if (!room) continue;
      const normalizedName = normalizeAirbnbListingName(alias.name);
      const existingAlias = findAliasByName.get(room.id, normalizedName);
      const historyNote = "Alias histórico verificado en el CSV Airbnb 2026-01 a 2026-07.";
      if (existingAlias) updateHistoricalAlias.run(alias.name, historyNote, existingAlias.id);
      else insertHistoricalAlias.run(room.id, alias.name, normalizedName, historyNote);
    }
    db.exec("INSERT INTO schema_migrations (version) VALUES (5)");
  })();
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_habitacion TEXT NOT NULL UNIQUE,
      nombre_habitacion TEXT NOT NULL,
      tipo_habitacion TEXT DEFAULT '',
      descripcion TEXT DEFAULT '',
      acomodacion TEXT DEFAULT '',
      capacidad INTEGER DEFAULT 2,
      camas INTEGER DEFAULT 0,
      tipo_cama TEXT DEFAULT '',
      sofa_cama INTEGER DEFAULT 0,
      tipo_vista TEXT DEFAULT '',
      tina TEXT DEFAULT '',
      jacuzzi_interno TEXT DEFAULT '',
      precio_base_noche REAL DEFAULT 0,
      estado TEXT DEFAULT 'disponible',
      color_calendario TEXT DEFAULT '#4f9da6',
      pendiente_revision INTEGER DEFAULT 0,
      foto_url TEXT DEFAULT '',
      airbnb_listing_id TEXT DEFAULT '',
      airbnb_ical_url TEXT DEFAULT '',
      airbnb_ical_activo INTEGER DEFAULT 0,
      airbnb_ultima_sincronizacion TEXT DEFAULT '',
      airbnb_ultimo_estado TEXT DEFAULT '',
      airbnb_ultimo_error TEXT DEFAULT '',
      fecha_creacion TEXT DEFAULT (datetime('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_interno TEXT,
      numero_remision TEXT,
      nombre_completo_huesped TEXT NOT NULL,
      nombre_huesped TEXT,
      apellido_huesped TEXT,
      cedula TEXT,
      correo TEXT,
      telefono TEXT,
      direccion TEXT,
      cantidad_huespedes INTEGER DEFAULT 1,
      fecha_ingreso TEXT NOT NULL,
      fecha_salida TEXT NOT NULL,
      noches INTEGER DEFAULT 0,
      tipo_estadia TEXT DEFAULT 'noche',
      valor_base REAL DEFAULT 0,
      total_pago REAL DEFAULT 0,
      abono REAL DEFAULT 0,
      saldo REAL DEFAULT 0,
      porcentaje_anticipo_sugerido REAL DEFAULT 50,
      fecha_abono TEXT,
      banco_o_medio_pago TEXT,
      metodo_pago TEXT DEFAULT 'transferencia',
      estado_reserva TEXT DEFAULT 'confirmada',
      llegada_verificada INTEGER DEFAULT 0,
      estado_pago TEXT DEFAULT 'sin_pago',
      origen_reserva TEXT DEFAULT 'whatsapp',
      airbnb_ok INTEGER DEFAULT 0,
      whatsapp_ok INTEGER DEFAULT 0,
      siigo_ok INTEGER DEFAULT 0,
      queo_ok INTEGER DEFAULT 0,
      observaciones TEXT,
      total_manual INTEGER DEFAULT 0,
      abono_importado REAL,
      saldo_importado REAL,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula TEXT UNIQUE,
      primer_nombre TEXT DEFAULT '',
      segundo_nombre TEXT DEFAULT '',
      primer_apellido TEXT DEFAULT '',
      segundo_apellido TEXT DEFAULT '',
      nombre_completo TEXT DEFAULT '',
      correo TEXT DEFAULT '',
      telefono TEXT DEFAULT '',
      direccion TEXT DEFAULT '',
      fecha_creacion TEXT DEFAULT (datetime('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'recepcion', 'aseo', 'consulta')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      full_name_original TEXT NOT NULL DEFAULT '',
      document_type TEXT DEFAULT '',
      document_number TEXT DEFAULT '',
      document_country TEXT DEFAULT '',
      phone_country_code TEXT DEFAULT '',
      phone_number TEXT DEFAULT '',
      phone_normalized TEXT DEFAULT '',
      phone_last4 TEXT DEFAULT '',
      email TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      preferred_language TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'MANUAL',
      profile_status TEXT NOT NULL DEFAULT 'ACTIVE',
      identity_confidence TEXT DEFAULT 'UNVERIFIED',
      source_reservation_id INTEGER,
      requires_review INTEGER NOT NULL DEFAULT 0,
      merged_into_guest_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
      FOREIGN KEY (merged_into_guest_id) REFERENCES guests(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reservation_guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      guest_id INTEGER NOT NULL,
      is_primary_guest INTEGER NOT NULL DEFAULT 0,
      guest_category TEXT NOT NULL DEFAULT 'adult',
      check_in_completed INTEGER NOT NULL DEFAULT 0,
      check_out_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reservation_id, guest_id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS guest_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('guest', 'financial', 'operational')),
      visibility TEXT NOT NULL DEFAULT 'internal',
      content TEXT NOT NULL,
      author_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS backup_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      sha256 TEXT DEFAULT '',
      manifest_json TEXT NOT NULL DEFAULT '{}',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      protected INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_sha256 TEXT NOT NULL,
      status TEXT NOT NULL,
      summary_json TEXT NOT NULL DEFAULT '{}',
      backup_record_id INTEGER,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (backup_record_id) REFERENCES backup_records(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS airbnb_listing_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      listing_id TEXT DEFAULT '',
      listing_name_original TEXT DEFAULT '',
      listing_name_normalized TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'IMPORT',
      verified_with_chrome INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      UNIQUE(room_id, listing_name_normalized),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservation_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      habitacion_id INTEGER NOT NULL,
      codigo_habitacion_original TEXT,
      precio_asignado REAL,
      notas TEXT,
      FOREIGN KEY (reserva_id) REFERENCES reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      fecha_pago TEXT,
      metodo_pago TEXT DEFAULT 'transferencia',
      banco_o_medio TEXT,
      referencia_pago TEXT,
      nota TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reservations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      pago_id INTEGER,
      nombre_archivo TEXT NOT NULL,
      ruta_archivo TEXT NOT NULL,
      tipo_archivo TEXT,
      monto_reportado REAL,
      fecha_subida TEXT DEFAULT (datetime('now')),
      nota TEXT,
      FOREIGN KEY (reserva_id) REFERENCES reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (pago_id) REFERENCES payments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habitacion_id INTEGER NOT NULL,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      motivo TEXT,
      notas TEXT,
      origen_bloqueo TEXT DEFAULT 'manual',
      tipo_bloqueo TEXT DEFAULT 'manual',
      grupo_bloqueo TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_archivo TEXT NOT NULL,
      fecha_importacion TEXT DEFAULT (datetime('now')),
      cantidad_filas INTEGER DEFAULT 0,
      cantidad_reservas_creadas INTEGER DEFAULT 0,
      cantidad_alertas INTEGER DEFAULT 0,
      estado TEXT DEFAULT 'completada',
      resumen TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER,
      importacion_id INTEGER,
      tipo_alerta TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      severidad TEXT DEFAULT 'media',
      resuelta INTEGER DEFAULT 0,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reservations(id) ON DELETE CASCADE,
      FOREIGN KEY (importacion_id) REFERENCES imports(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS airbnb_sync_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habitacion_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      ical_url TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      sync_interval_minutes INTEGER DEFAULT 60,
      last_sync_at TEXT,
      last_status TEXT,
      last_error TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now')),
      fecha_actualizacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS airbnb_sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      uid TEXT NOT NULL,
      reserva_id INTEGER,
      block_id INTEGER,
      summary TEXT,
      fecha_ingreso TEXT,
      fecha_salida TEXT,
      last_seen_at TEXT DEFAULT (datetime('now')),
      fecha_creacion TEXT DEFAULT (datetime('now')),
      UNIQUE(feed_id, uid),
      FOREIGN KEY (feed_id) REFERENCES airbnb_sync_feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (reserva_id) REFERENCES reservations(id) ON DELETE SET NULL,
      FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS airbnb_listing_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL UNIQUE,
      listing_id TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      fetched_at TEXT,
      last_error TEXT DEFAULT '',
      fecha_actualizacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_cleaning_status (
      habitacion_id INTEGER PRIMARY KEY,
      estado TEXT NOT NULL DEFAULT 'sin limpiar',
      fecha_estado TEXT NOT NULL DEFAULT (date('now')),
      prioridad TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      fecha_actualizacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_cleaning_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habitacion_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      estado TEXT NOT NULL,
      prioridad TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      fecha_creacion TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cleaning_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habitacion_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      nombre_archivo TEXT NOT NULL,
      ruta_archivo TEXT NOT NULL,
      tipo_archivo TEXT DEFAULT '',
      nota TEXT DEFAULT '',
      fecha_subida TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (habitacion_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_codigo ON rooms(codigo_habitacion);
    CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(fecha_ingreso, fecha_salida);
    CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(nombre_completo_huesped);
    CREATE INDEX IF NOT EXISTS idx_clients_cedula ON clients(cedula);
    CREATE INDEX IF NOT EXISTS idx_clients_nombre ON clients(nombre_completo);
    CREATE INDEX IF NOT EXISTS idx_reservation_rooms_room ON reservation_rooms(habitacion_id);
    CREATE INDEX IF NOT EXISTS idx_blocks_dates ON blocks(fecha_inicio, fecha_fin);
    CREATE INDEX IF NOT EXISTS idx_payments_reserva ON payments(reserva_id);
    CREATE INDEX IF NOT EXISTS idx_airbnb_sync_events_uid ON airbnb_sync_events(feed_id, uid);
    CREATE INDEX IF NOT EXISTS idx_airbnb_listing_details_listing ON airbnb_listing_details(listing_id);
    CREATE INDEX IF NOT EXISTS idx_cleaning_history_date ON room_cleaning_history(fecha);
    CREATE INDEX IF NOT EXISTS idx_cleaning_evidence_room_date ON cleaning_evidence(habitacion_id, fecha);
    CREATE INDEX IF NOT EXISTS idx_guests_document ON guests(document_type, document_number);
    CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests(phone_normalized);
    CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_reservation_guests_reservation ON reservation_guests(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_reservation_guests_guest ON reservation_guests(guest_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_backup_records_created ON backup_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_import_batches_created ON import_batches(created_at);
  `);

  db.exec("INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)");

  const roomColumns = db.prepare("PRAGMA table_info(rooms)").all().map((column) => column.name);
  const addRoomColumn = (name, definition) => {
    if (!roomColumns.includes(name)) {
      db.exec(`ALTER TABLE rooms ADD COLUMN ${name} ${definition}`);
    }
  };
  addRoomColumn("acomodacion", "TEXT DEFAULT ''");
  addRoomColumn("camas", "INTEGER DEFAULT 0");
  addRoomColumn("tipo_cama", "TEXT DEFAULT ''");
  addRoomColumn("sofa_cama", "INTEGER DEFAULT 0");
  addRoomColumn("tipo_vista", "TEXT DEFAULT ''");
  addRoomColumn("tina", "TEXT DEFAULT ''");
  addRoomColumn("jacuzzi_interno", "TEXT DEFAULT ''");
  addRoomColumn("foto_url", "TEXT DEFAULT ''");
  addRoomColumn("airbnb_listing_id", "TEXT DEFAULT ''");
  addRoomColumn("airbnb_ical_url", "TEXT DEFAULT ''");
  addRoomColumn("airbnb_ical_activo", "INTEGER DEFAULT 0");
  addRoomColumn("airbnb_ultima_sincronizacion", "TEXT DEFAULT ''");
  addRoomColumn("airbnb_ultimo_estado", "TEXT DEFAULT ''");
  addRoomColumn("airbnb_ultimo_error", "TEXT DEFAULT ''");

  db.exec(`
    UPDATE rooms
    SET airbnb_listing_id = COALESCE(NULLIF(airbnb_listing_id, ''), (
          SELECT f.nombre FROM airbnb_sync_feeds f
          WHERE f.habitacion_id = rooms.id
          ORDER BY f.activo DESC, f.id DESC
          LIMIT 1
        ), ''),
        airbnb_ical_url = COALESCE(NULLIF(airbnb_ical_url, ''), (
          SELECT f.ical_url FROM airbnb_sync_feeds f
          WHERE f.habitacion_id = rooms.id
          ORDER BY f.activo DESC, f.id DESC
          LIMIT 1
        ), ''),
        airbnb_ical_activo = CASE
          WHEN airbnb_ical_activo = 1 THEN 1
          ELSE COALESCE((
            SELECT f.activo FROM airbnb_sync_feeds f
            WHERE f.habitacion_id = rooms.id
            ORDER BY f.activo DESC, f.id DESC
            LIMIT 1
          ), airbnb_ical_activo, 0)
        END,
        airbnb_ultima_sincronizacion = COALESCE(NULLIF(airbnb_ultima_sincronizacion, ''), (
          SELECT COALESCE(f.last_sync_at, '') FROM airbnb_sync_feeds f
          WHERE f.habitacion_id = rooms.id
          ORDER BY f.activo DESC, f.id DESC
          LIMIT 1
        ), ''),
        airbnb_ultimo_estado = COALESCE(NULLIF(airbnb_ultimo_estado, ''), (
          SELECT CASE
            WHEN COALESCE(f.last_error, '') <> '' THEN 'error'
            WHEN COALESCE(f.last_sync_at, '') <> '' THEN 'ok'
            ELSE ''
          END
          FROM airbnb_sync_feeds f
          WHERE f.habitacion_id = rooms.id
          ORDER BY f.activo DESC, f.id DESC
          LIMIT 1
        ), ''),
        airbnb_ultimo_error = COALESCE(NULLIF(airbnb_ultimo_error, ''), (
          SELECT COALESCE(f.last_error, '') FROM airbnb_sync_feeds f
          WHERE f.habitacion_id = rooms.id
          ORDER BY f.activo DESC, f.id DESC
          LIMIT 1
        ), '')
    WHERE EXISTS (SELECT 1 FROM airbnb_sync_feeds f WHERE f.habitacion_id = rooms.id)
  `);

  const reservationColumns = db.prepare("PRAGMA table_info(reservations)").all().map((column) => column.name);
  if (!reservationColumns.includes("llegada_verificada")) {
    db.exec("ALTER TABLE reservations ADD COLUMN llegada_verificada INTEGER DEFAULT 0");
  }
  if (!reservationColumns.includes("primary_guest_id")) {
    db.exec("ALTER TABLE reservations ADD COLUMN primary_guest_id INTEGER");
  }
  if (!reservationColumns.includes("check_in_at")) {
    db.exec("ALTER TABLE reservations ADD COLUMN check_in_at TEXT");
  }
  if (!reservationColumns.includes("check_out_at")) {
    db.exec("ALTER TABLE reservations ADD COLUMN check_out_at TEXT");
  }
  if (!reservationColumns.includes("status_reason")) {
    db.exec("ALTER TABLE reservations ADD COLUMN status_reason TEXT DEFAULT ''");
  }
  if (reservationColumns.includes("origen_reserva")) {
    db.exec(`
      UPDATE reservations
      SET origen_reserva = CASE
        WHEN lower(trim(coalesce(origen_reserva, ''))) = 'airbnb' THEN 'airbnb'
        ELSE 'whatsapp'
      END
      WHERE origen_reserva IS NULL
         OR trim(origen_reserva) = ''
         OR lower(trim(origen_reserva)) NOT IN ('airbnb', 'whatsapp')
    `);
  }

  backfillClientsFromReservations();

  const blockColumns = db.prepare("PRAGMA table_info(blocks)").all().map((column) => column.name);
  const addBlockColumn = (name, definition) => {
    if (!blockColumns.includes(name)) {
      db.exec(`ALTER TABLE blocks ADD COLUMN ${name} ${definition}`);
    }
  };
  addBlockColumn("origen_bloqueo", "TEXT DEFAULT 'manual'");
  addBlockColumn("tipo_bloqueo", "TEXT DEFAULT 'manual'");
  addBlockColumn("grupo_bloqueo", "TEXT");
  db.exec(`
    UPDATE blocks
    SET origen_bloqueo = 'airbnb',
        tipo_bloqueo = 'airbnb'
    WHERE lower(coalesce(motivo, '')) LIKE '%airbnb%'
      AND (origen_bloqueo IS NULL OR origen_bloqueo = '' OR origen_bloqueo = 'manual')
  `);

  const airbnbEventColumns = db.prepare("PRAGMA table_info(airbnb_sync_events)").all().map((column) => column.name);
  if (!airbnbEventColumns.includes("block_id")) {
    db.exec("ALTER TABLE airbnb_sync_events ADD COLUMN block_id INTEGER");
  }

  syncVerifiedAirbnbListingDirectory();
  syncRenamedAirbnbListingDirectory();

  db.exec("INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)");
  db.exec("PRAGMA user_version = 5");
}

migrate();

module.exports = { db, databasePath, projectRoot };
