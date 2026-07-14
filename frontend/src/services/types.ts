export type RoomStatus = "disponible" | "mantenimiento" | "inactiva";

export interface Room {
  id: number;
  codigo_habitacion: string;
  nombre_habitacion: string;
  tipo_habitacion: string;
  descripcion: string;
  acomodacion: string;
  capacidad: number;
  camas: number;
  tipo_cama: string;
  sofa_cama: number;
  tipo_vista: string;
  tina: string;
  jacuzzi_interno: string;
  precio_base_noche: number;
  estado: RoomStatus;
  color_calendario: string;
  foto_url: string;
  pendiente_revision: number;
  airbnb_listing_id: string;
  airbnb_ical_url: string;
  airbnb_ical_activo: number;
  airbnb_ultima_sincronizacion: string;
  airbnb_ultimo_estado: string;
  airbnb_ultimo_error: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface ReservationRoom extends Room {
  reserva_id: number;
  habitacion_id: number;
  codigo_habitacion_original: string;
  precio_asignado: number;
  notas: string;
}

export interface Payment {
  id: number;
  reserva_id: number;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
  banco_o_medio: string;
  referencia_pago: string;
  nota: string;
  fecha_creacion: string;
}

export interface Attachment {
  id: number;
  reserva_id: number;
  pago_id?: number;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string;
  monto_reportado?: number;
  fecha_subida: string;
  nota: string;
}

export interface BackupRecord {
  id: number;
  kind: string;
  status: string;
  file_name: string;
  file_path: string;
  sha256: string;
  size_bytes: number;
  protected: number;
  created_at: string;
}

export interface Client {
  id: number;
  cedula: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  nombre_completo: string;
  correo: string;
  telefono: string;
  direccion: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface AlertItem {
  id: number;
  reserva_id?: number;
  importacion_id?: number;
  tipo_alerta: string;
  mensaje: string;
  severidad: "baja" | "media" | "alta";
  resuelta: number;
  fecha_creacion: string;
}

export interface Reservation {
  id: number;
  numero_interno: string;
  numero_remision: string;
  nombre_completo_huesped: string;
  nombre_huesped: string;
  apellido_huesped: string;
  cedula: string;
  correo: string;
  telefono: string;
  direccion: string;
  cantidad_huespedes: number;
  fecha_ingreso: string;
  fecha_salida: string;
  noches: number;
  tipo_estadia: string;
  valor_base: number;
  total_pago: number;
  abono: number;
  saldo: number;
  porcentaje_anticipo_sugerido: number;
  fecha_abono: string;
  banco_o_medio_pago: string;
  metodo_pago: string;
  estado_reserva: string;
  llegada_verificada: number | boolean;
  estado_pago: string;
  origen_reserva: string;
  airbnb_ok: boolean;
  whatsapp_ok: boolean;
  siigo_ok: boolean;
  queo_ok: boolean;
  observaciones: string;
  total_manual: boolean;
  abono_importado?: number;
  saldo_importado?: number;
  fecha_creacion: string;
  fecha_actualizacion: string;
  rooms: ReservationRoom[];
  payments: Payment[];
  attachments: Attachment[];
  alerts: AlertItem[];
}

export interface Block {
  id: number;
  habitacion_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
  notas: string;
  origen_bloqueo: string;
  tipo_bloqueo: string;
  grupo_bloqueo: string;
  fecha_creacion: string;
  codigo_habitacion?: string;
  nombre_habitacion?: string;
  color_calendario?: string;
}

export interface AirbnbFeed {
  id: number;
  habitacion_id: number;
  nombre: string;
  ical_url: string;
  activo: number;
  sync_interval_minutes: number;
  last_sync_at: string;
  last_status: string;
  last_error: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  codigo_habitacion: string;
  nombre_habitacion: string;
}

export interface AirbnbListingData {
  listing_id?: string;
  title?: string;
  tagline?: string;
  property_type?: string;
  listing_url?: string;
  photos?: string[];
  highlights?: string[];
  location?: string;
  city?: string;
  full_address?: string;
  latitude?: number;
  longitude?: number;
  guest_capacity?: number;
  bedroom_count?: number;
  bathroom_count?: number;
  bed_count?: number;
  host_name?: string;
  host_id?: string | number;
  host_avatar?: string;
  is_superhost?: boolean;
  is_verified?: boolean;
  host_rating?: number;
  host_review_count?: number;
  years_hosting?: number;
  overall_rating?: number;
  review_count?: number;
  is_guest_favorite?: boolean;
  rating_categories?: { category?: string; score?: string | number }[];
  pricing?: {
    rate?: number;
    nightly_rate?: number;
    qualifier?: string;
    currency?: string;
    total?: number | null;
    total_cost?: number | null;
    priceItems?: { title?: string; amount?: number }[];
    cost_breakdown?: { label?: string; amount?: number }[];
  };
  cancellation_policy?: string;
  cancellation_terms?: string[];
  is_available?: boolean;
  unavailability_reason?: string | null;
  [key: string]: unknown;
}

export interface AirbnbListingDetailsResponse {
  room: Pick<Room, "id" | "codigo_habitacion" | "nombre_habitacion" | "airbnb_listing_id">;
  listing: AirbnbListingData;
  fetched_at: string;
  last_error: string;
  cached: boolean;
  source: string;
}

export interface Dashboard {
  today: string;
  period_start: string;
  period_end: string;
  reservas_hoy: number;
  reservas_periodo: number;
  ingresos_estimados_mes: number;
  total_abonado_mes: number;
  saldo_periodo: number;
  saldos_pendientes: number;
  habitaciones_ocupadas_hoy: number;
  habitaciones_disponibles_hoy: number;
  habitaciones_bloqueadas: number;
  noches_periodo: number;
  ticket_promedio: number;
  ocupacion_promedio: number;
  proximos_ingresos: Reservation[];
  proximas_salidas: Reservation[];
  reservas_con_saldo_periodo: Reservation[];
  reservas_sin_comprobante_periodo: Reservation[];
  reservas_sin_comprobante: number;
  reservas_con_saldo_pendiente: number;
  reservas_con_alertas: number;
  total_por_banco_o_medio: { banco: string; total: number }[];
  total_por_metodo_pago: { metodo: string; total: number }[];
  reservas_por_estado_pago: { estado: string; total: number }[];
  reservas_por_estado_reserva: { estado: string; total: number }[];
  promedio_diario_mes: number;
  canal?: string;
  resumen_por_canal?: { origen: string; reservas: number; ingresos: number; abonado: number; saldo: number }[];
  ingresos_por_dia?: { fecha: string; total: number }[];
  ocupacion_por_dia?: { fecha: string; ocupadas: number; porcentaje: number }[];
  reservas_por_canal?: { canal: string; total: number }[];
  controles_pendientes?: { saldos: number; sin_comprobante: number; alertas: number };
}

export interface OperationRow {
  id: string;
  reserva_id: number;
  habitacion_id: number;
  habitacion: string;
  huesped: string;
  telefono: string;
  canal: string;
  ingreso: string;
  salida: string;
  prioridad: string;
  categoria: string;
  remision?: string;
  detalle?: string;
}

export interface TodayOperations {
  date: string;
  tomorrow: string;
  checkins_today: OperationRow[];
  checkins_tomorrow: OperationRow[];
  in_house: OperationRow[];
  checkouts_today: OperationRow[];
  second_day_cleaning: OperationRow[];
  urgent_turnovers: OperationRow[];
}

export interface CleaningRoom {
  habitacion_id: number;
  codigo_habitacion: string;
  nombre_habitacion: string;
  estado: "sin limpiar" | "por limpiar" | "limpiando" | "limpio";
  fecha_estado: string;
  prioridad: string;
  notas: string;
  fecha_actualizacion: string;
}

export interface CleaningReport {
  date: string;
  rooms: CleaningRoom[];
  history: Array<{
    id: number;
    habitacion_id: number;
    fecha: string;
    estado: string;
    prioridad: string;
    notas: string;
    fecha_creacion: string;
    codigo_habitacion: string;
    nombre_habitacion: string;
  }>;
}

export interface CleaningEvidence {
  id: number;
  habitacion_id: number;
  fecha: string;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string;
  nota: string;
  fecha_subida: string;
}

export interface BillingItem {
  id: number;
  included: boolean;
  index: number;
  remision: string;
  huesped: string;
  cedula: string;
  habitacion: string;
  ingreso: string;
  salida: string;
  banco: string;
  total: number;
  porcentaje: number;
  comision: number;
}

export interface BillingAccount {
  start: string;
  end: string;
  period_label: string;
  porcentaje: number;
  conectividad: number;
  otros: number;
  emisor: {
    nombre: string;
    documento: string;
    telefono: string;
    correo: string;
  };
  concepto: string;
  items: BillingItem[];
  summary: {
    remisiones_incluidas: number;
    total_remisiones: number;
    porcentaje: number;
    valor_comision: number;
    conectividad: number;
    otros: number;
    total_cuenta: number;
    dias_periodo: number;
  };
}
