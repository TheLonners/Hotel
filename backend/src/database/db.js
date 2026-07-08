const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
require("dotenv").config();

const projectRoot = path.resolve(__dirname, "../../..");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(projectRoot, process.env.DATABASE_PATH)
  : path.join(projectRoot, "data", "hotel.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.transaction = function transaction(handler) {
  return (...args) => {
    db.exec("BEGIN");
    try {
      const result = handler(...args);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
};

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

    CREATE INDEX IF NOT EXISTS idx_rooms_codigo ON rooms(codigo_habitacion);
    CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(fecha_ingreso, fecha_salida);
    CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(nombre_completo_huesped);
    CREATE INDEX IF NOT EXISTS idx_reservation_rooms_room ON reservation_rooms(habitacion_id);
    CREATE INDEX IF NOT EXISTS idx_blocks_dates ON blocks(fecha_inicio, fecha_fin);
    CREATE INDEX IF NOT EXISTS idx_payments_reserva ON payments(reserva_id);
    CREATE INDEX IF NOT EXISTS idx_airbnb_sync_events_uid ON airbnb_sync_events(feed_id, uid);
    CREATE INDEX IF NOT EXISTS idx_cleaning_history_date ON room_cleaning_history(fecha);
  `);

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
}

migrate();

module.exports = { db, databasePath, projectRoot };
