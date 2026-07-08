"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  addDays,
  calendarDays,
  currentMonth,
  diffDays,
  effectiveEnd,
  formatMoney,
  formatPercent,
  formatRoomPrice,
  isAirbnbPlaceholderName,
  parseDate,
  paymentClass,
  reservationParams,
  roomLabel,
  shiftMonth,
  today
} from "./lib/hotel-utils";
import { api, type ImportPreview, type RoomImportPreview } from "./services/api";
import type { AirbnbFeed, Attachment, BillingAccount, Block, CleaningReport, CleaningRoom, Dashboard, OperationRow, Reservation, Room, TodayOperations } from "./services/types";

type View = "today" | "calendar" | "cleaning" | "dashboard" | "rooms" | "airbnb" | "airbnbReservations" | "import" | "billing";

type AirbnbImportPreview = {
  nombre_archivo: string;
  filas: number;
  canImportCount: number;
  createCount: number;
  updateCount: number;
  alertCount: number;
  rows: {
    rowNumber: number;
    action: string;
    canImport: boolean;
    alerts: { severidad: string; mensaje: string }[];
    data: Record<string, unknown>;
  }[];
};

const emptyReservation = {
  numero_interno: "",
  numero_remision: "",
  nombre_completo_huesped: "",
  nombre_huesped: "",
  apellido_huesped: "",
  cedula: "",
  correo: "",
  telefono: "",
  direccion: "",
  cantidad_huespedes: "1",
  fecha_ingreso: today,
  fecha_salida: today,
  noches: "0",
  tipo_estadia: "noche",
  valor_base: "0",
  total_pago: "0",
  abono: "0",
  saldo: "0",
  porcentaje_anticipo_sugerido: "50",
  fecha_abono: "",
  banco_o_medio_pago: "",
  metodo_pago: "transferencia",
  estado_reserva: "confirmada",
  estado_pago: "sin_pago",
  origen_reserva: "whatsapp",
  observaciones: "",
  airbnb_ok: false,
  whatsapp_ok: false,
  siigo_ok: false,
  queo_ok: false
};

export default function App() {
  const [view, setView] = useState<View>("today");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [reservationSearch, setReservationSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [reservationModal, setReservationModal] = useState<{ open: boolean; edit?: Reservation; prefill?: Record<string, unknown> }>({ open: false });
  const [blockModal, setBlockModal] = useState<Record<string, unknown> | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const roomsRequestRef = useRef(0);
  const calendarRequestRef = useRef(0);

  const loadRooms = async () => {
    const requestId = roomsRequestRef.current + 1;
    roomsRequestRef.current = requestId;
    try {
      const roomData = await api.rooms();
      if (requestId === roomsRequestRef.current) {
        setRooms(roomData);
      }
    } catch (err) {
      if (requestId === roomsRequestRef.current) {
        setError(err instanceof Error ? err.message : "Error cargando habitaciones.");
      }
    }
  };

  const loadCalendarData = async () => {
    const requestId = calendarRequestRef.current + 1;
    calendarRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const params = reservationParams(month, reservationSearch, filters);
      const [reservationData, blockData, dashboardData] = await Promise.all([
        api.reservations(params),
        api.blocks(),
        api.dashboard()
      ]);
      if (requestId !== calendarRequestRef.current) return;
      setReservations(reservationData);
      setBlocks(blockData);
      setDashboard(dashboardData);
      if (selected) {
        const fresh = reservationData.find((reservation) => reservation.id === selected.id);
        setSelected(fresh || selected);
      }
    } catch (err) {
      if (requestId === calendarRequestRef.current) {
        setError(err instanceof Error ? err.message : "Error cargando datos.");
      }
    } finally {
      if (requestId === calendarRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const load = async () => {
    await Promise.all([loadRooms(), loadCalendarData()]);
  };

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    loadCalendarData();
  }, [month, reservationSearch, filters]);

  return (
    <div className={`app-shell ${view === "calendar" ? "calendar-mode" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">VM</span>
          <div>
            <strong>Vista Montaña</strong>
            <span>Apartasuites</span>
          </div>
        </div>
        <nav className="top-nav">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><Home size={17} />Hoy</button>
          <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}><CalendarDays size={17} />Calendario</button>
          <button className={view === "cleaning" ? "active" : ""} onClick={() => setView("cleaning")}><Check size={17} />Limpieza</button>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><LayoutDashboard size={17} />Dashboard</button>
          <button className={view === "rooms" ? "active" : ""} onClick={() => setView("rooms")}><BedDouble size={17} />Habitaciones</button>
          <button className={view === "airbnb" ? "active" : ""} onClick={() => setView("airbnb")}><RefreshCw size={17} />Airbnb</button>
          <button className={view === "airbnbReservations" ? "active" : ""} onClick={() => setView("airbnbReservations")}><Home size={17} />Reservas Airbnb</button>
          <button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><FileSpreadsheet size={17} />Importar</button>
          <button className={view === "billing" ? "active" : ""} onClick={() => setView("billing")}><CreditCard size={17} />Cuenta de cobro</button>
        </nav>
        <button
          className="ghost icon-text"
          title="Guardar contraseña simple de API si ADMIN_PASSWORD esta configurada"
          onClick={() => {
            const value = window.prompt("Contraseña API opcional", localStorage.getItem("hotel_admin_password") || "");
            if (value !== null) {
              if (value) localStorage.setItem("hotel_admin_password", value);
              else localStorage.removeItem("hotel_admin_password");
              load();
            }
          }}
        >
          <Lock size={17} /> Clave
        </button>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Cargando datos...</div>}

      <main className="mobile-layout">
        <MobileHome
          reservations={reservations}
          search={reservationSearch}
          setSearch={setReservationSearch}
          onNew={() => setReservationModal({ open: true })}
          onAvailability={() => setAvailabilityOpen(true)}
          onImport={() => setView("import")}
          onBalances={() => setFilters({ saldo_pendiente: "1" })}
          onSelect={setSelected}
        />
      </main>

      <main className="desktop-layout">
        {view === "calendar" && (
          <CalendarView
            month={month}
            setMonth={setMonth}
            rooms={rooms}
            reservations={reservations}
            blocks={blocks}
            reservationSearch={reservationSearch}
            setReservationSearch={setReservationSearch}
            roomSearch={roomSearch}
            setRoomSearch={setRoomSearch}
            filters={filters}
            setFilters={setFilters}
            onNew={(prefill) => setReservationModal({ open: true, prefill })}
            onBlock={(prefill) => setBlockModal(prefill || {})}
            onSelect={setSelected}
            onBlockSelect={setSelectedBlock}
            onAvailability={() => setAvailabilityOpen((value) => !value)}
          />
        )}
        {view === "today" && <TodayView onSelect={setSelected} />}
        {view === "cleaning" && <CleaningView />}
        {view === "dashboard" && <DashboardView dashboard={dashboard} onSelect={setSelected} />}
        {view === "rooms" && <RoomsView rooms={rooms} reservations={reservations} onSaved={load} onBlock={() => setBlockModal({})} />}
        {view === "airbnb" && <AirbnbSyncView rooms={rooms} onChanged={load} />}
        {view === "airbnbReservations" && <AirbnbReservationsView onChanged={load} onSelect={setSelected} />}
        {view === "import" && <ImportView rooms={rooms} onImported={load} />}
        {view === "billing" && <BillingView />}
      </main>

      {availabilityOpen && (
        <AvailabilityPanel
          rooms={rooms}
          onClose={() => setAvailabilityOpen(false)}
          onCreate={(prefill) => setReservationModal({ open: true, prefill })}
        />
      )}

      {selected && (
        <DetailPanel
          reservation={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setReservationModal({ open: true, edit: selected })}
          onChanged={load}
        />
      )}

      {selectedBlock && (
        <BlockDetailPanel
          block={selectedBlock}
          blocks={blocks}
          onClose={() => setSelectedBlock(null)}
          onChanged={() => {
            setSelectedBlock(null);
            load();
          }}
        />
      )}

      {reservationModal.open && (
        <ReservationModal
          rooms={rooms}
          reservation={reservationModal.edit}
          prefill={reservationModal.prefill}
          onClose={() => setReservationModal({ open: false })}
          onSaved={(reservation) => {
            setReservationModal({ open: false });
            setSelected(reservation);
            load();
          }}
        />
      )}

      {blockModal && (
        <BlockModal
          rooms={rooms}
          prefill={blockModal}
          onClose={() => setBlockModal(null)}
          onSaved={() => {
            setBlockModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CalendarView(props: {
  month: string;
  setMonth: (month: string) => void;
  rooms: Room[];
  reservations: Reservation[];
  blocks: Block[];
  reservationSearch: string;
  setReservationSearch: (value: string) => void;
  roomSearch: string;
  setRoomSearch: (value: string) => void;
  filters: Record<string, string>;
  setFilters: (value: Record<string, string>) => void;
  onNew: (prefill?: Record<string, unknown>) => void;
  onBlock: (prefill?: Record<string, unknown>) => void;
  onSelect: (reservation: Reservation) => void;
  onBlockSelect: (block: Block) => void;
  onAvailability: () => void;
}) {
  const days = useMemo(() => calendarDays(props.month), [props.month]);
  const hasActiveReservationFilters = Boolean(props.reservationSearch.trim()) || Object.values(props.filters).some(Boolean);
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number; room: Room; date: string } | null>(null);
  const visibleRooms = useMemo(() => {
    const roomQuery = props.roomSearch.trim().toLowerCase();
    const roomFiltered = roomQuery
      ? props.rooms.filter((room) =>
        room.codigo_habitacion.toLowerCase().includes(roomQuery) ||
        room.nombre_habitacion.toLowerCase().includes(roomQuery)
      )
      : props.rooms;
    if (!hasActiveReservationFilters) return roomFiltered;
    const roomIds = new Set<number>();
    props.reservations.forEach((reservation) => {
      reservation.rooms.forEach((room) => roomIds.add(room.habitacion_id));
    });
    return roomFiltered.filter((room) => roomIds.has(room.id));
  }, [hasActiveReservationFilters, props.roomSearch, props.rooms, props.reservations]);
  const dayWidth = 76;
  const roomListRef = useRef<HTMLDivElement | null>(null);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);

  const scrollToDate = (date: string) => {
    const index = days.indexOf(date);
    if (index < 0 || !calendarScrollRef.current) return;
    calendarScrollRef.current.scrollTo({
      left: Math.max(0, index * dayWidth - dayWidth),
      behavior: "smooth"
    });
  };

  const goToday = () => {
    props.setMonth(currentMonth);
    window.setTimeout(() => scrollToDate(today), 80);
  };

  useEffect(() => {
    if (props.month === currentMonth) {
      window.setTimeout(() => scrollToDate(today), 80);
    } else if (calendarScrollRef.current) {
      calendarScrollRef.current.scrollLeft = 0;
    }
  }, [props.month, days.join("|")]);

  const syncVerticalScroll = (source: "rooms" | "calendar") => {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }

    const sourceElement = source === "rooms" ? roomListRef.current : calendarScrollRef.current;
    const targetElement = source === "rooms" ? calendarScrollRef.current : roomListRef.current;
    if (!sourceElement || !targetElement || targetElement.scrollTop === sourceElement.scrollTop) return;

    syncingScrollRef.current = true;
    targetElement.scrollTop = sourceElement.scrollTop;
  };

  return (
    <section className="calendar-page">
      <div className="toolbar">
        <div className="month-controls">
          <div className="month-stepper">
            <button className="icon" title="Mes anterior" onClick={() => props.setMonth(shiftMonth(props.month, -1))}><ChevronLeft size={18} /></button>
            <button className="icon" title="Mes siguiente" onClick={() => props.setMonth(shiftMonth(props.month, 1))}><ChevronRight size={18} /></button>
          </div>
          <input type="month" value={props.month} onChange={(event) => props.setMonth(event.target.value)} />
          <button onClick={goToday}><Home size={16} />Hoy</button>
        </div>
        <div className="toolbar-actions">
          <button className="primary" onClick={() => props.onNew()}><Plus size={17} />Nueva reserva</button>
          <button onClick={() => props.onBlock()}><Lock size={17} />Bloquear</button>
        </div>
      </div>

      <div className="filter-row">
        <label className="search-box">
          <Search size={17} />
          <input value={props.reservationSearch} onChange={(event) => props.setReservationSearch(event.target.value)} placeholder="Reserva..." />
        </label>
        <label className="search-box room-search">
          <Search size={17} />
          <input value={props.roomSearch} onChange={(event) => props.setRoomSearch(event.target.value)} placeholder="Habitacion..." />
        </label>
        <select value={props.filters.estado_pago || ""} onChange={(event) => props.setFilters({ ...props.filters, estado_pago: event.target.value })}>
          <option value="">Pago</option>
          <option value="sin_pago">Sin pago</option>
          <option value="saldo_pendiente">Pendiente</option>
          <option value="pagado_total">Pagado</option>
        </select>
        <select value={props.filters.estado_reserva || ""} onChange={(event) => props.setFilters({ ...props.filters, estado_reserva: event.target.value })}>
          <option value="">Reserva</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmada">Confirmada</option>
          <option value="hospedado">Hospedado</option>
          <option value="finalizada">Finalizada</option>
          <option value="cancelada">Cancelada</option>
          <option value="reprogramada">Reprogramada</option>
        </select>
        <select value={props.filters.origen_reserva || ""} onChange={(event) => props.setFilters({ ...props.filters, origen_reserva: event.target.value })}>
          <option value="">Canal</option>
          <option value="airbnb">Airbnb</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <details className="filter-menu">
          <summary>Mas</summary>
          <div className="filter-menu-panel">
            <label><input type="checkbox" checked={Boolean(props.filters.saldo_pendiente)} onChange={(event) => props.setFilters({ ...props.filters, saldo_pendiente: event.target.checked ? "1" : "" })} /> Saldos pendientes</label>
            <label><input type="checkbox" checked={Boolean(props.filters.con_alertas)} onChange={(event) => props.setFilters({ ...props.filters, con_alertas: event.target.checked ? "1" : "" })} /> Con alertas</label>
            <label><input type="checkbox" checked={Boolean(props.filters.sin_comprobante)} onChange={(event) => props.setFilters({ ...props.filters, sin_comprobante: event.target.checked ? "1" : "" })} /> Sin comprobante</label>
          </div>
        </details>
        <button onClick={props.onAvailability}>Disponibilidad</button>
      </div>

      <div className="calendar-shell">
        <div className="room-column">
          <div className="room-header">{visibleRooms.length} habitaciones</div>
          <div
            className="room-list"
            ref={roomListRef}
            onScroll={() => syncVerticalScroll("rooms")}
            onWheel={(event) => {
              if (!calendarScrollRef.current) return;
              event.preventDefault();
              calendarScrollRef.current.scrollTop += event.deltaY;
              calendarScrollRef.current.scrollLeft += event.deltaX;
            }}
          >
          {visibleRooms.length === 0 && (
            <div className="empty-room-list">
              {props.rooms.length === 0 ? "No hay habitaciones registradas." : "No hay habitaciones con resultados para este filtro."}
            </div>
          )}
            {visibleRooms.map((room) => (
              <div className={`room-cell ${room.estado === "inactiva" ? "disabled-room" : ""}`} key={room.id}>
                <span className="room-dot" style={{ background: room.color_calendario }} />
                <div>
                  <strong>{room.codigo_habitacion}</strong>
                <small>{room.nombre_habitacion} · {room.capacidad} pax</small>
              </div>
            </div>
          ))}
            <div className="calendar-bottom-spacer" />
          </div>
        </div>
        <div className="calendar-scroll" ref={calendarScrollRef} onScroll={() => syncVerticalScroll("calendar")}>
          <div className="date-grid" style={{ width: days.length * dayWidth }}>
            <div className="date-header">
              {days.map((day) => (
                <div className={`date-cell ${day === today ? "today" : ""}`} key={day}>
                  <span>{new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" }).format(parseDate(day))}</span>
                  <strong>{day.slice(8)}</strong>
                </div>
              ))}
            </div>
            {visibleRooms.map((room) => (
              <CalendarRoomRow
                key={room.id}
                room={room}
                days={days}
                dayWidth={dayWidth}
                reservations={props.reservations}
                blocks={props.blocks}
                onSelect={props.onSelect}
                onBlockSelect={props.onBlockSelect}
                onEmptyCell={(room, date, rect) => setCellMenu({ room, date, x: rect.left, y: rect.top })}
              />
            ))}
            <div className="calendar-bottom-spacer" />
            {visibleRooms.length === 0 && (
              <div className="empty-calendar-grid">
                {props.rooms.length === 0 ? "Crea habitaciones o importa tu Excel para ver disponibilidad en el calendario." : "Ajusta los filtros para volver a ver habitaciones."}
              </div>
            )}
          </div>
        </div>
      </div>
      {cellMenu && (
        <div className="cell-menu" style={{ left: cellMenu.x + 8, top: cellMenu.y + 8 }}>
          <strong>{cellMenu.room.codigo_habitacion} · {cellMenu.date}</strong>
          <button onClick={() => {
            props.onNew({
              roomIds: [cellMenu.room.id],
              fecha_ingreso: cellMenu.date,
              fecha_salida: addDays(cellMenu.date, 1),
              valor_base: String(cellMenu.room.precio_base_noche || 0)
            });
            setCellMenu(null);
          }}><Plus size={15} />Nueva reserva</button>
          <button onClick={() => {
            props.onBlock({
              roomIds: [cellMenu.room.id],
              habitacion_id: cellMenu.room.id,
              fecha_inicio: cellMenu.date,
              fecha_fin: addDays(cellMenu.date, 1)
            });
            setCellMenu(null);
          }}><Lock size={15} />Bloquear habitacion</button>
          <button onClick={() => setCellMenu(null)}><X size={15} />Cerrar</button>
        </div>
      )}
    </section>
  );
}

function CalendarRoomRow(props: {
  room: Room;
  days: string[];
  dayWidth: number;
  reservations: Reservation[];
  blocks: Block[];
  onSelect: (reservation: Reservation) => void;
  onBlockSelect: (block: Block) => void;
  onEmptyCell: (room: Room, date: string, rect: DOMRect) => void;
}) {
  const monthStart = props.days[0];
  const monthEnd = addDays(props.days[props.days.length - 1], 1);
  const roomReservations = props.reservations.filter((reservation) => reservation.rooms.some((room) => room.habitacion_id === props.room.id));
  const roomBlocks = props.blocks.filter((block) => block.habitacion_id === props.room.id);

  const position = (start: string, end: string) => {
    const visibleStart = start < monthStart ? monthStart : start;
    const visibleEnd = effectiveEnd(start, end) > monthEnd ? monthEnd : effectiveEnd(start, end);
    const left = Math.max(0, diffDays(monthStart, visibleStart)) * props.dayWidth + 5;
    const span = Math.max(1, diffDays(visibleStart, visibleEnd));
    const width = Math.max(44, span * props.dayWidth - 10);
    return { left, width };
  };

  const isBusy = (day: string) => {
    const hasReservation = roomReservations.some((reservation) =>
      day >= reservation.fecha_ingreso && day < effectiveEnd(reservation.fecha_ingreso, reservation.fecha_salida)
    );
    const hasBlock = roomBlocks.some((block) =>
      day >= block.fecha_inicio && day < effectiveEnd(block.fecha_inicio, block.fecha_fin)
    );
    return hasReservation || hasBlock;
  };

  return (
    <div className={`calendar-row ${props.room.estado === "inactiva" ? "disabled-room-row" : ""}`} style={{ width: props.days.length * props.dayWidth }}>
      {props.days.map((day) => {
        const busy = isBusy(day);
        return (
          <button
            type="button"
            className={`day-slot ${day === today ? "today-line" : ""}`}
            key={day}
            disabled={busy}
            title={busy ? "" : `Crear accion en ${props.room.codigo_habitacion} - ${day}`}
            onClick={(event) => props.onEmptyCell(props.room, day, event.currentTarget.getBoundingClientRect())}
          />
        );
      })}
      {roomBlocks.map((block) => {
        const style = position(block.fecha_inicio, block.fecha_fin);
        const isAirbnb = block.origen_bloqueo === "airbnb" || block.tipo_bloqueo === "airbnb";
        const isEvent = block.tipo_bloqueo === "evento" || block.origen_bloqueo === "evento";
        return (
          <button
            className={`${isAirbnb ? "airbnb-block-chip" : "block-bar"} ${isEvent ? "event-block" : ""}`}
            key={block.id}
            style={{ left: style.left, width: style.width }}
            title={block.motivo}
            onClick={() => props.onBlockSelect(block)}
          >
            {block.motivo || "Bloqueado"}
          </button>
        );
      })}
      {roomReservations.map((reservation) => {
        const style = position(reservation.fecha_ingreso, reservation.fecha_salida);
        return (
          <button
            className={`reservation-bar ${paymentClass(reservation.estado_pago)} ${reservation.estado_reserva === "cancelada" ? "cancelled" : ""}`}
            key={`${reservation.id}-${props.room.id}`}
            style={{ left: style.left, width: style.width }}
            onClick={() => props.onSelect(reservation)}
            title={`${reservation.nombre_completo_huesped} · ${formatMoney(reservation.total_pago)} · saldo ${formatMoney(reservation.saldo)}`}
          >
            <strong>{reservation.nombre_completo_huesped}</strong>
            <span>{roomLabel(reservation)} · {formatMoney(reservation.saldo)} · {reservation.numero_remision || "sin remision"}</span>
          </button>
        );
      })}
    </div>
  );
}

function DetailPanel(props: { reservation: Reservation; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const [payment, setPayment] = useState({ monto: "", fecha_pago: today, metodo_pago: "transferencia", banco_o_medio: "", referencia_pago: "", nota: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [remisionValue, setRemisionValue] = useState(props.reservation.numero_remision || "");
  const [remisionSaving, setRemisionSaving] = useState(false);
  const [remisionMessage, setRemisionMessage] = useState("");
  const reservation = props.reservation;

  useEffect(() => {
    setRemisionValue(props.reservation.numero_remision || "");
    setRemisionMessage("");
  }, [props.reservation.id, props.reservation.numero_remision]);

  const refreshReservation = async () => {
    props.onChanged();
  };

  const saveRemision = async () => {
    setRemisionSaving(true);
    setRemisionMessage("");
    try {
      await api.updateReservation(reservation.id, { numero_remision: remisionValue.trim() });
      setRemisionMessage("Remision actualizada.");
      refreshReservation();
    } catch (err) {
      setRemisionMessage(err instanceof Error ? err.message : "No se pudo actualizar la remision.");
    } finally {
      setRemisionSaving(false);
    }
  };

  const addPaymentSubmit = async () => {
    if (!payment.monto) return;
    setBusy(true);
    try {
      await api.createPayment(reservation.id, payment);
      setPayment({ monto: "", fecha_pago: today, metodo_pago: "transferencia", banco_o_medio: "", referencia_pago: "", nota: "" });
      refreshReservation();
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("nota", uploadNote);
    setBusy(true);
    try {
      await api.uploadAttachment(reservation.id, form);
      setFile(null);
      setUploadNote("");
      refreshReservation();
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (estado_reserva: string) => {
    await api.updateReservation(reservation.id, { ...reservation, roomIds: reservation.rooms.map((room) => room.habitacion_id), estado_reserva });
    refreshReservation();
  };

  return (
    <aside className="detail-panel">
      <div className="panel-header">
        <div>
          <span className={`status-dot ${paymentClass(reservation.estado_pago)}`} />
          <strong>{reservation.nombre_completo_huesped}</strong>
          <small>{reservation.numero_remision || "Sin remision"} · {reservation.estado_reserva}</small>
        </div>
        <button className="icon" onClick={props.onClose}><X size={20} /></button>
      </div>

      <div className="panel-section money-summary">
        <div><span>Total</span><strong>{formatMoney(reservation.total_pago)}</strong></div>
        <div><span>Abonado</span><strong>{formatMoney(reservation.abono)}</strong></div>
        <div><span>Saldo</span><strong>{formatMoney(reservation.saldo)}</strong></div>
      </div>

      <div className="panel-section">
        <h3>No. remision</h3>
        <div className="mini-form inline-form">
          <input value={remisionValue} onChange={(event) => setRemisionValue(event.target.value)} placeholder="N. remision" />
          <button disabled={remisionSaving} onClick={saveRemision}><Check size={16} />Guardar</button>
        </div>
        {remisionMessage && <small className="form-note">{remisionMessage}</small>}
      </div>

      <div className="panel-section detail-grid">
        <span>Habitaciones</span><strong>{roomLabel(reservation)}</strong>
        <span>Ingreso</span><strong>{reservation.fecha_ingreso}</strong>
        <span>Salida</span><strong>{reservation.fecha_salida}</strong>
        <span>Noches</span><strong>{reservation.noches}</strong>
        <span>Huespedes</span><strong>{reservation.cantidad_huespedes}</strong>
        <span>Cedula</span><strong>{reservation.cedula || "Sin dato"}</strong>
        <span>Telefono</span><strong>{reservation.telefono || "Sin dato"}</strong>
        <span>Correo</span><strong>{reservation.correo || "Sin dato"}</strong>
        <span>Direccion</span><strong>{reservation.direccion || "Sin dato"}</strong>
        <span>Banco/medio</span><strong>{reservation.banco_o_medio_pago || "Sin dato"}</strong>
      </div>

      <div className="panel-section chips">
        <span className={reservation.airbnb_ok ? "chip ok" : "chip"}>AIRBNB</span>
        <span className={reservation.whatsapp_ok ? "chip ok" : "chip"}>WHAT</span>
        <span className={reservation.siigo_ok ? "chip ok" : "chip"}>SIIGO</span>
        <span className={reservation.queo_ok ? "chip ok" : "chip"}>QUEO</span>
      </div>

      {reservation.observaciones && <p className="notes">{reservation.observaciones}</p>}

      {reservation.alerts.length > 0 && (
        <div className="panel-section">
          <h3>Alertas</h3>
          {reservation.alerts.map((alert) => (
            <div className={`alert-line ${alert.severidad}`} key={alert.id}>{alert.mensaje}</div>
          ))}
        </div>
      )}

      <div className="panel-section">
        <h3>Pagos</h3>
        {reservation.payments.map((item) => (
          <div className="list-row" key={item.id}>
            <div><strong>{formatMoney(item.monto)}</strong><small>{item.fecha_pago} · {item.banco_o_medio || item.metodo_pago}</small></div>
            <button className="icon" title="Eliminar pago" onClick={async () => { if (window.confirm("Eliminar este pago?")) { await api.deletePayment(item.id); refreshReservation(); } }}><X size={16} /></button>
          </div>
        ))}
        <div className="mini-form">
          <input placeholder="Monto" value={payment.monto} onChange={(event) => setPayment({ ...payment, monto: event.target.value })} />
          <input type="date" value={payment.fecha_pago} onChange={(event) => setPayment({ ...payment, fecha_pago: event.target.value })} />
          <input placeholder="Banco o medio" value={payment.banco_o_medio} onChange={(event) => setPayment({ ...payment, banco_o_medio: event.target.value })} />
          <button disabled={busy} onClick={addPaymentSubmit}><CreditCard size={16} />Registrar pago</button>
          {reservation.saldo > 0 && <button disabled={busy} onClick={() => api.createPayment(reservation.id, { monto: reservation.saldo, fecha_pago: today, metodo_pago: reservation.metodo_pago, banco_o_medio: reservation.banco_o_medio_pago, nota: "Marcado como pagado" }).then(refreshReservation)}><Check size={16} />Marcar pagado</button>}
        </div>
      </div>

      <div className="panel-section">
        <h3>Comprobantes</h3>
        {reservation.attachments.map((item: Attachment) => (
          <div className="list-row" key={item.id}>
            <a href={item.ruta_archivo} target="_blank" rel="noreferrer"><Paperclip size={15} />{item.nombre_archivo}</a>
            <button className="icon" title="Eliminar comprobante" onClick={async () => { if (window.confirm("Eliminar este comprobante?")) { await api.deleteAttachment(item.id); refreshReservation(); } }}><X size={16} /></button>
          </div>
        ))}
        <div className="mini-form">
          <input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <input placeholder="Nota" value={uploadNote} onChange={(event) => setUploadNote(event.target.value)} />
          <button disabled={busy || !file} onClick={uploadAttachment}><Upload size={16} />Adjuntar</button>
        </div>
      </div>

      <div className="panel-actions">
        <button onClick={props.onEdit}>Editar</button>
        <button onClick={() => updateStatus("reprogramada")}>Reprogramar</button>
        <button onClick={() => updateStatus("finalizada")}>Finalizar</button>
        <button className="danger" onClick={() => { if (window.confirm("Cancelar esta reserva?")) updateStatus("cancelada"); }}>Cancelar</button>
        <button className="danger" onClick={async () => { if (window.confirm("Eliminar reserva?")) { await api.deleteReservation(reservation.id); props.onClose(); props.onChanged(); } }}>Eliminar</button>
      </div>
    </aside>
  );
}

function ReservationModal(props: {
  rooms: Room[];
  reservation?: Reservation;
  prefill?: Record<string, unknown>;
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
}) {
  const initialRooms = props.reservation?.rooms.map((room) => room.habitacion_id) || (props.prefill?.roomIds as number[] | undefined) || [];
  const [form, setForm] = useState<Record<string, any>>({ ...emptyReservation, ...(props.reservation || {}), ...(props.prefill || {}) });
  const [roomIds, setRoomIds] = useState<number[]>(initialRooms);
  const [manualTotal, setManualTotal] = useState(Boolean(props.reservation?.total_manual));
  const [error, setError] = useState("");

  useEffect(() => {
    const start = String(form.fecha_ingreso || "");
    const end = String(form.fecha_salida || "");
    const nights = start && end ? Math.max(0, diffDays(start, end)) : 0;
    const value = Number(form.valor_base || 0);
    const total = manualTotal ? Number(form.total_pago || 0) : nights * value;
    const abono = Number(form.abono || 0);
    setForm((current) => ({
      ...current,
      noches: String(nights),
      total_pago: String(total),
      saldo: String(Math.max(0, total - abono)),
      estado_pago: abono <= 0 ? "sin_pago" : abono >= total ? "pagado_total" : "saldo_pendiente"
    }));
  }, [form.fecha_ingreso, form.fecha_salida, form.valor_base, form.abono, manualTotal]);

  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError("");
    try {
      const body = { ...form, roomIds, total_manual: manualTotal };
      const saved = props.reservation
        ? await api.updateReservation(props.reservation.id, body)
        : await api.createReservation(body);
      props.onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal wide-modal">
        <div className="modal-header">
          <div>
            <strong>{props.reservation ? "Editar reserva" : "Nueva reserva"}</strong>
            <span>Fechas, huesped, habitaciones, pagos y controles del Excel</span>
          </div>
          <button className="icon" onClick={props.onClose}><X size={20} /></button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="form-grid">
          <label className="full">Habitaciones
            <div className="room-picker">
              {props.rooms.map((room) => (
                <button
                  type="button"
                  className={roomIds.includes(room.id) ? "selected-room" : ""}
                  key={room.id}
                  onClick={() => setRoomIds((current) => current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id])}
                >
                  <span style={{ background: room.color_calendario }} />{room.codigo_habitacion}
                </button>
              ))}
            </div>
          </label>
          <Field label="Nombre completo" value={String(form.nombre_completo_huesped || "")} onChange={(value) => update("nombre_completo_huesped", value)} required />
          <Field label="Nombre" value={String(form.nombre_huesped || "")} onChange={(value) => update("nombre_huesped", value)} />
          <Field label="Apellido" value={String(form.apellido_huesped || "")} onChange={(value) => update("apellido_huesped", value)} />
          <Field label="Cedula" value={String(form.cedula || "")} onChange={(value) => update("cedula", value)} />
          <Field label="Correo" value={String(form.correo || "")} onChange={(value) => update("correo", value)} />
          <Field label="Telefono" value={String(form.telefono || "")} onChange={(value) => update("telefono", value)} />
          <Field label="Direccion" value={String(form.direccion || "")} onChange={(value) => update("direccion", value)} />
          <Field label="Huespedes" type="number" value={String(form.cantidad_huespedes || "")} onChange={(value) => update("cantidad_huespedes", value)} />
          <Field label="Fecha ingreso" type="date" value={String(form.fecha_ingreso || "")} onChange={(value) => update("fecha_ingreso", value)} />
          <Field label="Fecha salida" type="date" value={String(form.fecha_salida || "")} onChange={(value) => update("fecha_salida", value)} />
          <label>Tipo estadia
            <select value={String(form.tipo_estadia || "noche")} onChange={(event) => update("tipo_estadia", event.target.value)}>
              <option value="noche">Noche</option>
              <option value="day_use">Day use</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <Field label="Noches" type="number" value={String(form.noches || "0")} onChange={(value) => update("noches", value)} />
          <Field label="Valor base" type="number" value={String(form.valor_base || "0")} onChange={(value) => update("valor_base", value)} />
          <label>Total
            <input type="number" value={String(form.total_pago || "0")} onChange={(event) => { setManualTotal(true); update("total_pago", event.target.value); }} />
          </label>
          <Field label="Abono inicial" type="number" value={String(form.abono || "0")} onChange={(value) => update("abono", value)} />
          <Field label="Saldo" type="number" value={String(form.saldo || "0")} onChange={(value) => update("saldo", value)} />
          <Field label="Fecha abono" type="date" value={String(form.fecha_abono || "")} onChange={(value) => update("fecha_abono", value)} />
          <Field label="Banco o medio" value={String(form.banco_o_medio_pago || "")} onChange={(value) => update("banco_o_medio_pago", value)} />
          <label>Metodo pago
            <select value={String(form.metodo_pago || "transferencia")} onChange={(event) => update("metodo_pago", event.target.value)}>
              {["transferencia", "efectivo", "tarjeta", "link_pago", "nequi", "davivienda", "bancolombia", "bold", "otro"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <Field label="No. remision" value={String(form.numero_remision || "")} onChange={(value) => update("numero_remision", value)} />
          <label>Estado reserva
            <select value={String(form.estado_reserva || "confirmada")} onChange={(event) => update("estado_reserva", event.target.value)}>
              {["pendiente", "confirmada", "hospedado", "finalizada", "cancelada", "reprogramada"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Origen
            <select value={String(form.origen_reserva || "whatsapp")} onChange={(event) => update("origen_reserva", event.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="airbnb">Airbnb</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={Boolean(form.airbnb_ok)} onChange={(event) => update("airbnb_ok", event.target.checked)} />AIRBNB OK</label>
          <label className="check"><input type="checkbox" checked={Boolean(form.whatsapp_ok)} onChange={(event) => update("whatsapp_ok", event.target.checked)} />WhatsApp OK</label>
          <label className="check"><input type="checkbox" checked={Boolean(form.siigo_ok)} onChange={(event) => update("siigo_ok", event.target.checked)} />SIIGO OK</label>
          <label className="check"><input type="checkbox" checked={Boolean(form.queo_ok)} onChange={(event) => update("queo_ok", event.target.checked)} />QUEO OK</label>
          <label className="full">Observaciones
            <textarea value={String(form.observaciones || "")} onChange={(event) => update("observaciones", event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button onClick={() => setManualTotal(false)}>Recalcular total</button>
          <button onClick={props.onClose}>Cerrar</button>
          <button className="primary" onClick={submit}><Check size={17} />Guardar reserva</button>
        </div>
      </section>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label>{props.label}
      <input required={props.required} type={props.type || "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function BlockModal(props: { rooms: Room[]; prefill?: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const availableRooms = props.rooms.filter((room) => room.estado === "disponible");
  const prefillRoomIds = ((props.prefill?.roomIds as number[] | undefined) || (props.prefill?.habitacion_id ? [Number(props.prefill.habitacion_id)] : []))
    .filter((id) => availableRooms.some((room) => room.id === id));
  const initialRoomIds = prefillRoomIds.length ? prefillRoomIds : (availableRooms[0]?.id ? [availableRooms[0].id] : []);
  const [form, setForm] = useState({
    habitacion_id: initialRoomIds[0] || "",
    fecha_inicio: String(props.prefill?.fecha_inicio || today),
    fecha_fin: String(props.prefill?.fecha_fin || addDays(String(props.prefill?.fecha_inicio || today), 1)),
    motivo: String(props.prefill?.motivo || "Bloqueo"),
    notas: String(props.prefill?.notas || ""),
    tipo_bloqueo: String(props.prefill?.tipo_bloqueo || "manual")
  });
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>(initialRoomIds);
  const [allHotel, setAllHotel] = useState(false);
  const [error, setError] = useState("");
  const targetRoomIds = allHotel ? availableRooms.map((room) => room.id) : selectedRoomIds;

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-header"><strong>Bloquear habitaciones</strong><button className="icon" onClick={props.onClose}><X size={20} /></button></div>
        {error && <div className="notice error">{error}</div>}
        <div className="form-grid one">
          <label className="check"><input type="checkbox" checked={allHotel} onChange={(event) => setAllHotel(event.target.checked)} />Bloquear todo el hotel disponible</label>
          {!allHotel && (
            <label>Habitaciones
              <div className="room-picker">
                {availableRooms.map((room) => (
                  <button
                    type="button"
                    className={selectedRoomIds.includes(room.id) ? "selected-room" : ""}
                    key={room.id}
                    onClick={() => setSelectedRoomIds((current) => current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id])}
                  >
                    <span style={{ background: room.color_calendario }} />{room.codigo_habitacion}
                  </button>
                ))}
              </div>
            </label>
          )}
          <label>Tipo
            <select value={form.tipo_bloqueo} onChange={(event) => setForm({ ...form, tipo_bloqueo: event.target.value })}>
              <option value="manual">Bloqueo manual</option>
              <option value="evento">Evento / bloqueo masivo</option>
            </select>
          </label>
          <label style={{ display: "none" }}>Habitacion
            <select value={form.habitacion_id} onChange={(event) => setForm({ ...form, habitacion_id: Number(event.target.value) })}>
              {props.rooms.map((room) => <option key={room.id} value={room.id}>{room.codigo_habitacion} · {room.nombre_habitacion}</option>)}
            </select>
          </label>
          <Field label="Fecha inicio" type="date" value={form.fecha_inicio} onChange={(value) => setForm({ ...form, fecha_inicio: value })} />
          <Field label="Fecha fin" type="date" value={form.fecha_fin} onChange={(value) => setForm({ ...form, fecha_fin: value })} />
          <Field label="Motivo" value={form.motivo} onChange={(value) => setForm({ ...form, motivo: value })} />
          <label>Notas<textarea value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button onClick={props.onClose}>Cerrar</button>
          <button className="primary" onClick={async () => {
            try {
              if (!targetRoomIds.length) {
                setError("Selecciona al menos una habitacion.");
                return;
              }
              const groupId = targetRoomIds.length > 1 ? `bloqueo-${Date.now()}` : "";
              await Promise.all(targetRoomIds.map((roomId) => api.createBlock({
                ...form,
                habitacion_id: roomId,
                origen_bloqueo: form.tipo_bloqueo === "evento" ? "evento" : "manual",
                grupo_bloqueo: groupId
              })));
              props.onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo bloquear.");
            }
          }}>Guardar bloqueo</button>
        </div>
      </section>
    </div>
  );
}

function BlockDetailPanel(props: { block: Block; blocks: Block[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({
    fecha_inicio: props.block.fecha_inicio,
    fecha_fin: props.block.fecha_fin,
    motivo: props.block.motivo || "Bloqueo",
    notas: props.block.notas || "",
    tipo_bloqueo: props.block.tipo_bloqueo || props.block.origen_bloqueo || "manual"
  });
  const [error, setError] = useState("");
  const groupBlocks = props.block.grupo_bloqueo
    ? props.blocks.filter((block) => block.grupo_bloqueo === props.block.grupo_bloqueo)
    : [];

  const payload = {
    fecha_inicio: form.fecha_inicio,
    fecha_fin: form.fecha_fin,
    motivo: form.motivo,
    notas: form.notas,
    tipo_bloqueo: form.tipo_bloqueo,
    origen_bloqueo: form.tipo_bloqueo === "evento" ? "evento" : props.block.origen_bloqueo || "manual",
    grupo_bloqueo: props.block.grupo_bloqueo || ""
  };

  const save = async (group = false) => {
    setError("");
    try {
      const targets = group && groupBlocks.length ? groupBlocks : [props.block];
      await Promise.all(targets.map((block) => api.updateBlock(block.id, { ...payload, habitacion_id: block.habitacion_id })));
      props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el bloqueo.");
    }
  };

  const remove = async (group = false) => {
    if (!window.confirm(group ? "Eliminar todo este grupo de bloqueos?" : "Eliminar este bloqueo?")) return;
    setError("");
    try {
      const targets = group && groupBlocks.length ? groupBlocks : [props.block];
      await Promise.all(targets.map((block) => api.deleteBlock(block.id)));
      props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el bloqueo.");
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-header">
          <div>
            <strong>Detalle de bloqueo</strong>
            <span>{props.block.codigo_habitacion || props.block.habitacion_id} · {props.block.origen_bloqueo || "manual"}</span>
          </div>
          <button className="icon" onClick={props.onClose}><X size={20} /></button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="detail-grid panel-section">
          <span>Habitacion</span><strong>{props.block.codigo_habitacion || props.block.habitacion_id}</strong>
          <span>Creado</span><strong>{props.block.fecha_creacion || "Sin dato"}</strong>
          <span>Grupo</span><strong>{props.block.grupo_bloqueo || "Individual"}</strong>
        </div>
        <div className="form-grid one">
          <Field label="Fecha inicio" type="date" value={form.fecha_inicio} onChange={(value) => setForm({ ...form, fecha_inicio: value })} />
          <Field label="Fecha fin" type="date" value={form.fecha_fin} onChange={(value) => setForm({ ...form, fecha_fin: value })} />
          <label>Tipo
            <select value={form.tipo_bloqueo} onChange={(event) => setForm({ ...form, tipo_bloqueo: event.target.value })}>
              <option value="manual">Manual</option>
              <option value="evento">Evento</option>
              <option value="airbnb">Airbnb</option>
            </select>
          </label>
          <Field label="Motivo" value={form.motivo} onChange={(value) => setForm({ ...form, motivo: value })} />
          <label>Notas<textarea value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button onClick={() => save(false)}>Editar</button>
          {groupBlocks.length > 1 && <button onClick={() => save(true)}>Editar grupo</button>}
          <button className="danger" onClick={() => remove(false)}>Eliminar</button>
          {groupBlocks.length > 1 && <button className="danger" onClick={() => remove(true)}>Eliminar grupo</button>}
        </div>
      </section>
    </div>
  );
}

function AvailabilityPanel(props: { rooms: Room[]; onClose: () => void; onCreate: (prefill: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({ checkIn: today, checkOut: addDays(today, 1), guests: "2", type: "" });
  const [results, setResults] = useState<Room[]>([]);
  const [error, setError] = useState("");

  const search = async () => {
    setError("");
    try {
      setResults(await api.availability(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar disponibilidad.");
    }
  };

  return (
    <aside className="availability-panel">
      <div className="panel-header">
        <div><strong>Buscar disponibilidad</strong><small>Fechas, huespedes y tipo opcional</small></div>
        <button className="icon" onClick={props.onClose}><X size={20} /></button>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="mini-form">
        <input type="date" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} />
        <input type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} />
        <input type="number" value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} />
        <input placeholder="Tipo" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} />
        <button onClick={search}><Search size={16} />Buscar</button>
      </div>
      <div className="availability-list">
        {results.map((room) => (
          <div className="list-row" key={room.id}>
            <div>
              <strong>{room.codigo_habitacion} · {room.nombre_habitacion}</strong>
                <small>{room.capacidad} pax · {formatRoomPrice(room)}</small>
            </div>
            <button onClick={() => props.onCreate({ fecha_ingreso: form.checkIn, fecha_salida: form.checkOut, cantidad_huespedes: form.guests, valor_base: String(room.precio_base_noche), roomIds: [room.id] })}>Crear</button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TodayView(props: { onSelect: (reservation: Reservation) => void }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<TodayOperations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.today({ date }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el menu de hoy.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const openReservation = async (row: OperationRow) => {
    try {
      props.onSelect(await api.reservation(row.reserva_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la reserva.");
    }
  };

  return (
    <section className="today-page">
      <section className="dashboard-hero">
        <div>
          <span>Operacion diaria</span>
          <h1>Hoy</h1>
        </div>
        <div className="dashboard-filters">
          <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button onClick={() => setDate(today)}><Home size={16} />Hoy</button>
          <button onClick={load}><RefreshCw size={16} />Actualizar</button>
        </div>
      </section>
      {loading && <div className="notice">Cargando operacion...</div>}
      {error && <div className="notice error">{error}</div>}
      {!data ? (
        <div className="empty-state">Sin datos para mostrar.</div>
      ) : (
        <div className="operation-grid">
          <OperationList title="Urgentes" rows={data.urgent_turnovers} onSelect={openReservation} />
          <OperationList title="Ingresan hoy" rows={data.checkins_today} onSelect={openReservation} />
          <OperationList title="Ingresan manana" rows={data.checkins_tomorrow} onSelect={openReservation} />
          <OperationList title="Hospedados" rows={data.in_house} onSelect={openReservation} />
          <OperationList title="Salen hoy" rows={data.checkouts_today} onSelect={openReservation} />
          <OperationList title="Aseo segundo dia" rows={data.second_day_cleaning} onSelect={openReservation} />
        </div>
      )}
    </section>
  );
}

function OperationList(props: { title: string; rows: OperationRow[]; onSelect: (row: OperationRow) => void }) {
  return (
    <section className="work-panel operation-panel">
      <div className="panel-header">
        <strong>{props.title}</strong>
        <small>{props.rows.length} registros</small>
      </div>
      {props.rows.length === 0 && <p className="empty-copy">Sin registros.</p>}
      {props.rows.map((row) => (
        <button className="operation-row" key={row.id} onClick={() => props.onSelect(row)}>
          <div>
            <strong>Hab. {row.habitacion} - {row.huesped}</strong>
            <span>{row.telefono || "Sin telefono"} - {row.canal} - {row.ingreso} / {row.salida}</span>
            {row.detalle && <small>{row.detalle}</small>}
          </div>
          <span className={`priority-pill ${row.prioridad}`}>{row.prioridad}</span>
        </button>
      ))}
    </section>
  );
}

const cleaningStates: CleaningReport["rooms"][number]["estado"][] = ["sin limpiar", "por limpiar", "limpiando", "limpio"];
type CleaningFilter = "todas" | "pendientes" | "limpias";

function needsCleaning(room: CleaningRoom) {
  return room.estado !== "limpio" || room.prioridad === "urgente";
}

function formatCleaningState(state: CleaningRoom["estado"]) {
  return state.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleaningInitial(room: CleaningRoom) {
  return room.codigo_habitacion.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "VM";
}

function CleaningView() {
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<CleaningReport | null>(null);
  const [windowReports, setWindowReports] = useState<{ previous: CleaningReport | null; current: CleaningReport | null; next: CleaningReport | null }>({
    previous: null,
    current: null,
    next: null
  });
  const [filter, setFilter] = useState<CleaningFilter>("todas");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const previousDate = addDays(date, -1);
      const nextDate = addDays(date, 1);
      const [previous, current, next] = await Promise.all([
        api.cleaning({ date: previousDate }),
        api.cleaning({ date }),
        api.cleaning({ date: nextDate })
      ]);
      setWindowReports({ previous, current, next });
      setReport(current);
      setNotes(Object.fromEntries(current.rooms.map((room) => [room.habitacion_id, room.notas || ""])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar limpieza.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const updateRoom = async (room: CleaningReport["rooms"][number], estado = room.estado) => {
    setMessage("");
    setError("");
    try {
      await api.updateCleaning(room.habitacion_id, {
        fecha: date,
        estado,
        prioridad: room.prioridad,
        notas: notes[room.habitacion_id] || ""
      });
      setMessage(`Habitacion ${room.codigo_habitacion} actualizada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar limpieza.");
    }
  };

  const filteredRooms = (report?.rooms || []).filter((room) => {
    if (filter === "pendientes") return needsCleaning(room);
    if (filter === "limpias") return room.estado === "limpio" && room.prioridad !== "urgente";
    return true;
  });
  const taskCount = (windowReports.current?.rooms || []).filter(needsCleaning).length;
  const taskSummary = taskCount === 1 ? "1 limpieza pendiente" : `${taskCount} limpiezas pendientes`;
  const dayColumns = [
    { key: "previous", label: "Dia anterior", date: addDays(date, -1), report: windowReports.previous },
    { key: "current", label: "Hoy", date, report: windowReports.current },
    { key: "next", label: "Dia siguiente", date: addDays(date, 1), report: windowReports.next }
  ];

  return (
    <section className="cleaning-page">
      <section className="dashboard-hero">
        <div>
          <span>Control operativo</span>
          <h1>Limpieza</h1>
        </div>
        <div className="dashboard-filters">
          <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button onClick={load}><RefreshCw size={16} />Actualizar</button>
          <button onClick={() => api.downloadFile(`/api/cleaning/export.csv?date=${encodeURIComponent(date)}`, `limpieza-${date}.csv`)}><Download size={16} />Exportar</button>
        </div>
      </section>
      {loading && <div className="notice">Cargando limpieza...</div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      <section className="cleaning-board">
        <div className="cleaning-board-heading">
          <span>Prioridad operativa</span>
          <h2>Tienes {taskSummary}</h2>
        </div>
        <div className="cleaning-day-grid">
          {dayColumns.map((column) => {
            const tasks = (column.report?.rooms || []).filter(needsCleaning);
            return (
              <section className="cleaning-day-column" key={column.key}>
                <div className="cleaning-day-title">
                  <strong>{column.label}</strong>
                  <span>{column.date}</span>
                </div>
                <div className="cleaning-task-list">
                  {tasks.length === 0 && <div className="cleaning-empty">Sin limpiezas obligatorias</div>}
                  {tasks.map((room) => (
                    <article className={`cleaning-task-card ${room.prioridad === "urgente" ? "urgent" : ""}`} key={`${column.key}-${room.habitacion_id}`}>
                      <div>
                        <small>{formatCleaningState(room.estado)}</small>
                        <strong>{room.codigo_habitacion}</strong>
                        <span>{room.nombre_habitacion}</span>
                      </div>
                      <div className="cleaning-task-media" aria-hidden="true">
                        <span>{cleaningInitial(room)}</span>
                        <i />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
      <section className="work-panel cleaning-room-panel">
        <div className="cleaning-room-header">
          <div>
            <span>Menu interno</span>
            <h2>Todas las habitaciones</h2>
          </div>
          <div className="cleaning-tabs" aria-label="Filtro de habitaciones de limpieza">
            {([
              ["todas", "Todas"],
              ["pendientes", "Pendientes"],
              ["limpias", "Limpias"]
            ] as [CleaningFilter, string][]).map(([value, label]) => (
              <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
            ))}
          </div>
        </div>
        <div className="cleaning-grid">
          {filteredRooms.map((room) => (
            <section className={`cleaning-card ${room.estado.replace(/\s+/g, "-")} ${room.prioridad === "urgente" ? "urgent" : ""}`} key={room.habitacion_id}>
              <div className="cleaning-card-top">
                <div>
                  <strong>{room.codigo_habitacion}</strong>
                  <span>{room.nombre_habitacion}</span>
                </div>
                <div className="cleaning-room-mark" aria-hidden="true">{cleaningInitial(room)}</div>
              </div>
              <label>Estado
                <select value={room.estado} onChange={(event) => updateRoom(room, event.target.value as CleaningReport["rooms"][number]["estado"])}>
                  {cleaningStates.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </label>
              <label>Notas
                <input value={notes[room.habitacion_id] || ""} onChange={(event) => setNotes({ ...notes, [room.habitacion_id]: event.target.value })} />
              </label>
              <div className="cleaning-meta">
                <span className={`priority-pill ${room.prioridad || "normal"}`}>{room.prioridad || "normal"}</span>
                <small>{room.fecha_estado || date}</small>
              </div>
              <button onClick={() => updateRoom(room)}><Check size={16} />Guardar</button>
            </section>
          ))}
        </div>
      </section>
      {report && report.history.length > 0 && (
        <section className="work-panel">
          <h2>Historial del dia</h2>
          {report.history.slice(0, 30).map((item) => (
            <div className="list-row" key={item.id}>
              <strong>{item.codigo_habitacion} - {item.estado}</strong>
              <span>{item.prioridad || "normal"} - {item.fecha_creacion}</span>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}

function DashboardView(props: { dashboard: Dashboard | null; onSelect: (reservation: Reservation) => void }) {
  const defaultStart = props.dashboard?.period_start || `${currentMonth}-01`;
  const defaultEnd = props.dashboard?.period_end || `${shiftMonth(currentMonth, 1)}-01`;
  const [range, setRange] = useState({ start: defaultStart, end: defaultEnd });
  const [channel, setChannel] = useState<"todos" | "airbnb" | "whatsapp">("todos");
  const [dashboard, setDashboard] = useState<Dashboard | null>(props.dashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dashboard && props.dashboard) setDashboard(props.dashboard);
  }, [props.dashboard, dashboard]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.dashboard(channel === "todos" ? range : { ...range, origen_reserva: channel })
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, channel]);

  const setMonthRange = (month: string) => setRange({ start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` });
  const setQuarterRange = () => setRange({ start: `${currentMonth}-01`, end: `${shiftMonth(currentMonth, 3)}-01` });

  if (!dashboard) return <div className="empty-state">Sin datos de dashboard.</div>;

  const revenueCards = [
    ["Reservas periodo", dashboard.reservas_periodo],
    ["Ingresos estimados", formatMoney(dashboard.ingresos_estimados_mes)],
    ["Abonado recibido", formatMoney(dashboard.total_abonado_mes)],
    ["Saldo del periodo", formatMoney(dashboard.saldo_periodo)],
    ["Ticket promedio", formatMoney(dashboard.ticket_promedio)],
    ["Promedio diario", formatMoney(dashboard.promedio_diario_mes)]
  ];
  const operationCards = [
    ["Reservas hoy", dashboard.reservas_hoy],
    ["Ocupadas hoy", dashboard.habitaciones_ocupadas_hoy],
    ["Disponibles hoy", dashboard.habitaciones_disponibles_hoy],
    ["Bloqueadas hoy", dashboard.habitaciones_bloqueadas],
    ["Noches periodo", dashboard.noches_periodo],
    ["Ocupacion estimada", formatPercent(dashboard.ocupacion_promedio)]
  ];
  const controlCards = [
    ["Saldos pendientes total", formatMoney(dashboard.saldos_pendientes)],
    ["Reservas con saldo", dashboard.reservas_con_saldo_pendiente],
    ["Sin comprobante", dashboard.reservas_sin_comprobante],
    ["Con alertas", dashboard.reservas_con_alertas]
  ];

  return (
    <section className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span>Dashboard operativo</span>
          <h1>{range.start} a {addDays(range.end, -1)}</h1>
        </div>
        <div className="dashboard-filters">
          <div className="segmented-control">
            {(["todos", "airbnb", "whatsapp"] as const).map((item) => (
              <button key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>
                {item === "todos" ? "Todos" : item === "airbnb" ? "Airbnb" : "WhatsApp"}
              </button>
            ))}
          </div>
          <label>Desde<input type="date" value={range.start} onChange={(event) => setRange({ ...range, start: event.target.value })} /></label>
          <label>Hasta<input type="date" value={addDays(range.end, -1)} onChange={(event) => setRange({ ...range, end: addDays(event.target.value, 1) })} /></label>
          <button onClick={() => setMonthRange(currentMonth)}>Este mes</button>
          <button onClick={() => setMonthRange(shiftMonth(currentMonth, 1))}>Proximo mes</button>
          <button onClick={setQuarterRange}>3 meses</button>
        </div>
      </section>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Actualizando dashboard...</div>}

      <div className="dashboard-section-title">
        <h2>Comparativo por canal</h2>
        <span>Airbnb usa importes/pagos Airbnb; WhatsApp usa los pagos registrados en la plataforma.</span>
      </div>
      <div className="channel-grid">
        {["airbnb", "whatsapp"].map((origin) => {
          const row = dashboard.resumen_por_canal?.find((item) => item.origen === origin) || { origen: origin, reservas: 0, ingresos: 0, abonado: 0, saldo: 0 };
          return (
            <div className="channel-card" key={origin}>
              <strong>{origin === "airbnb" ? "Airbnb" : "WhatsApp"}</strong>
              <span>{row.reservas} reservas</span>
              <div><small>Ingresos</small><b>{formatMoney(row.ingresos)}</b></div>
              <div><small>Pagado</small><b>{formatMoney(row.abonado)}</b></div>
              <div><small>Saldo</small><b>{formatMoney(row.saldo)}</b></div>
            </div>
          );
        })}
      </div>

      <div className="dashboard-section-title">
        <h2>Ventas y cartera</h2>
        <span>Basado en reservas con ingreso dentro del rango seleccionado.</span>
      </div>
      <div className="metric-grid">
        {revenueCards.map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <div className="dashboard-section-title">
        <h2>Operacion</h2>
        <span>Estado de ocupacion y control del dia.</span>
      </div>
      <div className="metric-grid compact">
        {operationCards.map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <div className="dashboard-section-title">
        <h2>Controles</h2>
        <span>Puntos que conviene revisar antes del cierre.</span>
      </div>
      <div className="metric-grid control">
        {controlCards.map(([label, value]) => <div className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <div className="dashboard-section-title">
        <h2>Graficas</h2>
        <span>Vista rapida de ingresos, ocupacion, canales y pendientes.</span>
      </div>
      <div className="chart-grid">
        <ChartBarList
          title="Ingresos por dia"
          rows={(dashboard.ingresos_por_dia || []).slice(-18).map((item) => ({ label: item.fecha.slice(5), value: Number(item.total || 0), display: formatMoney(item.total) }))}
        />
        <ChartBarList
          title="Ocupacion"
          rows={(dashboard.ocupacion_por_dia || []).slice(0, 18).map((item) => ({ label: item.fecha.slice(5), value: Number(item.porcentaje || 0), display: formatPercent(item.porcentaje) }))}
        />
        <ChartBarList
          title="Reservas por canal"
          rows={(dashboard.reservas_por_canal || []).map((item) => ({ label: item.canal || "Sin canal", value: Number(item.total || 0), display: item.total }))}
        />
        <ChartBarList
          title="Pendientes"
          rows={[
            { label: "Saldos", value: Number(dashboard.controles_pendientes?.saldos || 0), display: dashboard.controles_pendientes?.saldos || 0 },
            { label: "Sin comprobante", value: Number(dashboard.controles_pendientes?.sin_comprobante || 0), display: dashboard.controles_pendientes?.sin_comprobante || 0 },
            { label: "Alertas", value: Number(dashboard.controles_pendientes?.alertas || 0), display: dashboard.controles_pendientes?.alertas || 0 }
          ]}
        />
      </div>

      <div className="dashboard-columns">
        <DashboardList title="Proximos ingresos" reservations={dashboard.proximos_ingresos} onSelect={props.onSelect} />
        <DashboardList title="Proximas salidas" reservations={dashboard.proximas_salidas} onSelect={props.onSelect} />
        <DashboardList title="Saldos del periodo" reservations={dashboard.reservas_con_saldo_periodo} onSelect={props.onSelect} />
      </div>

      <div className="dashboard-columns">
        <DashboardBreakdown title="Total por banco o medio" rows={dashboard.total_por_banco_o_medio.map((item) => ({ label: item.banco, value: formatMoney(item.total) }))} />
        <DashboardBreakdown title="Total por metodo de pago" rows={dashboard.total_por_metodo_pago.map((item) => ({ label: item.metodo, value: formatMoney(item.total) }))} />
        <section className="work-panel">
          <h2>Estados</h2>
          <DashboardBreakdown title="Pago" rows={dashboard.reservas_por_estado_pago.map((item) => ({ label: item.estado || "Sin estado", value: item.total }))} nested />
          <DashboardBreakdown title="Reserva" rows={dashboard.reservas_por_estado_reserva.map((item) => ({ label: item.estado || "Sin estado", value: item.total }))} nested />
        </section>
      </div>
    </section>
  );
}

function ChartBarList(props: { title: string; rows: { label: string; value: number; display: string | number }[] }) {
  const max = Math.max(1, ...props.rows.map((row) => Number(row.value || 0)));
  return (
    <section className="work-panel chart-panel">
      <h2>{props.title}</h2>
      {props.rows.length === 0 && <p className="empty-copy">Sin datos para graficar.</p>}
      <div className="bar-list">
        {props.rows.map((row) => (
          <div className="bar-row" key={`${props.title}-${row.label}`}>
            <span>{row.label}</span>
            <div><i style={{ width: `${Math.max(4, (Number(row.value || 0) / max) * 100)}%` }} /></div>
            <strong>{row.display}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardBreakdown(props: { title: string; rows: { label: string; value: string | number }[]; nested?: boolean }) {
  return (
    <section className={props.nested ? "breakdown-nested" : "work-panel"}>
      <h2>{props.title}</h2>
      {props.rows.length === 0 && <p className="empty-copy">Sin datos en este periodo.</p>}
      {props.rows.map((row) => (
        <div className="list-row" key={row.label}>
          <strong>{row.label}</strong>
          <span>{row.value}</span>
        </div>
      ))}
    </section>
  );
}

function DashboardList(props: { title: string; reservations: Reservation[]; onSelect: (reservation: Reservation) => void }) {
  return (
    <section className="work-panel">
      <h2>{props.title}</h2>
      {props.reservations.length === 0 && <p className="empty-copy">Sin reservas para mostrar.</p>}
      {props.reservations.map((reservation) => (
        <button className="reservation-card" key={reservation.id} onClick={() => props.onSelect(reservation)}>
          <strong>{reservation.nombre_completo_huesped}</strong>
          <span>{roomLabel(reservation)} · {reservation.fecha_ingreso} / {reservation.fecha_salida}</span>
          <small>{formatMoney(reservation.total_pago)} · saldo {formatMoney(reservation.saldo)}</small>
        </button>
      ))}
    </section>
  );
}

function BillingView() {
  const [start, setStart] = useState(`${currentMonth}-01`);
  const [end, setEnd] = useState(addDays(`${shiftMonth(currentMonth, 1)}-01`, -1));
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [items, setItems] = useState<BillingAccount["items"]>([]);
  const [porcentaje, setPorcentaje] = useState("5");
  const [conectividad, setConectividad] = useState("0");
  const [otros, setOtros] = useState("0");
  const [emisor, setEmisor] = useState({ nombre: "Tania Gysell Lopez", documento: "", telefono: "", correo: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const rate = Number(porcentaje || 0) > 1 ? Number(porcentaje || 0) / 100 : Number(porcentaje || 0);
  const enrichedItems = items.map((item, index) => ({
    ...item,
    index: index + 1,
    porcentaje: rate,
    comision: item.included ? Number(item.total || 0) * rate : 0
  }));
  const included = enrichedItems.filter((item) => item.included);
  const totalRemisiones = included.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const valorComision = included.reduce((sum, item) => sum + Number(item.comision || 0), 0);
  const totalCuenta = valorComision + Number(conectividad || 0) + Number(otros || 0);

  const payload = () => ({
    start,
    end,
    porcentaje: rate,
    conectividad: Number(conectividad || 0),
    otros: Number(otros || 0),
    emisor_nombre: emisor.nombre,
    emisor_documento: emisor.documento,
    emisor_telefono: emisor.telefono,
    emisor_correo: emisor.correo,
    items: enrichedItems
  });

  const load = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await api.billingAccount({
        start,
        end,
        porcentaje: String(rate || 0.05),
        conectividad,
        otros,
        emisor_nombre: emisor.nombre,
        emisor_documento: emisor.documento,
        emisor_telefono: emisor.telefono,
        emisor_correo: emisor.correo
      });
      setAccount(data);
      setItems(data.items);
      setEmisor(data.emisor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la cuenta de cobro.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const toggleItem = (id: number, includedValue: boolean) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, included: includedValue } : item));
  };

  const exportFile = async (type: "xlsx" | "pdf") => {
    setError("");
    setMessage("");
    try {
      await api.downloadPost(
        `/api/billing-account/export.${type}`,
        payload(),
        `cuenta-cobro-vista-montana-${start}-a-${end}.${type}`
      );
      setMessage(`Cuenta de cobro ${type.toUpperCase()} generada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar la cuenta de cobro.");
    }
  };

  return (
    <section className="billing-page">
      <section className="dashboard-hero">
        <div>
          <span>Remisiones con numero actualizado</span>
          <h1>Cuenta de cobro</h1>
        </div>
        <div className="dashboard-filters">
          <label>Desde<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label>Hasta<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          <button onClick={load}><RefreshCw size={16} />Actualizar</button>
          <button onClick={() => exportFile("xlsx")}><Download size={16} />Excel</button>
          <button onClick={() => exportFile("pdf")}><Download size={16} />PDF</button>
        </div>
      </section>
      {loading && <div className="notice">Cargando remisiones...</div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="billing-layout">
        <section className="work-panel">
          <h2>Parametros</h2>
          <div className="form-grid">
            <Field label="Emisor" value={emisor.nombre} onChange={(value) => setEmisor({ ...emisor, nombre: value })} />
            <Field label="Documento" value={emisor.documento} onChange={(value) => setEmisor({ ...emisor, documento: value })} />
            <Field label="Telefono" value={emisor.telefono} onChange={(value) => setEmisor({ ...emisor, telefono: value })} />
            <Field label="Correo" value={emisor.correo} onChange={(value) => setEmisor({ ...emisor, correo: value })} />
            <Field label="Porcentaje" type="number" value={porcentaje} onChange={setPorcentaje} />
            <Field label="Conectividad" type="number" value={conectividad} onChange={setConectividad} />
            <Field label="Otros" type="number" value={otros} onChange={setOtros} />
          </div>
        </section>
        <section className="work-panel billing-summary">
          <h2>Resumen</h2>
          <div><span>Remisiones incluidas</span><strong>{included.length}</strong></div>
          <div><span>Total remisiones</span><strong>{formatMoney(totalRemisiones)}</strong></div>
          <div><span>Comision {formatPercent(rate * 100)}</span><strong>{formatMoney(valorComision)}</strong></div>
          <div><span>Conectividad</span><strong>{formatMoney(conectividad)}</strong></div>
          <div><span>Otros</span><strong>{formatMoney(otros)}</strong></div>
          <div className="total"><span>Total cuenta</span><strong>{formatMoney(totalCuenta)}</strong></div>
          <small>{account?.period_label || `${start} a ${end}`}</small>
        </section>
      </div>

      <section className="work-panel">
        <div className="panel-header">
          <strong>Remisiones del periodo</strong>
          <small>{items.length} con numero de remision</small>
        </div>
        {items.length === 0 && <p className="empty-copy">No hay reservas con numero de remision en este periodo.</p>}
        <div className="billing-table">
          <table>
            <thead>
              <tr>
                <th>Incluir</th>
                <th>Remision</th>
                <th>Huesped</th>
                <th>Habitacion</th>
                <th>Ingreso</th>
                <th>Salida</th>
                <th>Banco/medio</th>
                <th>Total</th>
                <th>Comision</th>
              </tr>
            </thead>
            <tbody>
              {enrichedItems.map((item) => (
                <tr key={item.id}>
                  <td><input type="checkbox" checked={item.included} onChange={(event) => toggleItem(item.id, event.target.checked)} /></td>
                  <td>{item.remision}</td>
                  <td>{item.huesped}</td>
                  <td>{item.habitacion}</td>
                  <td>{item.ingreso}</td>
                  <td>{item.salida}</td>
                  <td>{item.banco || "Sin dato"}</td>
                  <td>{formatMoney(item.total)}</td>
                  <td>{formatMoney(item.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function RoomsView(props: { rooms: Room[]; reservations: Reservation[]; onSaved: () => void; onBlock: () => void }) {
  const [editing, setEditing] = useState<Room | null>(null);
  const [roomQuery, setRoomQuery] = useState("");
  const [form, setForm] = useState({
    codigo_habitacion: "",
    nombre_habitacion: "",
    tipo_habitacion: "",
    descripcion: "",
    capacidad: "2",
    precio_base_noche: "0",
    estado: "disponible",
    color_calendario: "#184B24",
    pendiente_revision: 0,
    airbnb_listing_id: "",
    airbnb_ical_url: "",
    airbnb_ical_activo: 0,
    airbnb_ultima_sincronizacion: "",
    airbnb_ultimo_estado: "",
    airbnb_ultimo_error: ""
  });
  const [busyIcal, setBusyIcal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filteredRooms = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (!query) return props.rooms;
    return props.rooms.filter((room) =>
      room.codigo_habitacion.toLowerCase().includes(query) ||
      room.nombre_habitacion.toLowerCase().includes(query)
    );
  }, [props.rooms, roomQuery]);

  useEffect(() => {
    if (editing) {
      setForm({
        codigo_habitacion: editing.codigo_habitacion,
        nombre_habitacion: editing.nombre_habitacion,
        tipo_habitacion: editing.tipo_habitacion,
        descripcion: editing.descripcion,
        capacidad: String(editing.capacidad),
        precio_base_noche: String(editing.precio_base_noche),
        estado: editing.estado,
        color_calendario: editing.color_calendario,
        pendiente_revision: editing.pendiente_revision,
        airbnb_listing_id: editing.airbnb_listing_id || "",
        airbnb_ical_url: editing.airbnb_ical_url || "",
        airbnb_ical_activo: Number(editing.airbnb_ical_activo || 0),
        airbnb_ultima_sincronizacion: editing.airbnb_ultima_sincronizacion || "",
        airbnb_ultimo_estado: editing.airbnb_ultimo_estado || "",
        airbnb_ultimo_error: editing.airbnb_ultimo_error || ""
      });
    }
  }, [editing]);

  const reset = () => {
    setEditing(null);
    setError("");
    setMessage("");
    setForm({
      codigo_habitacion: "",
      nombre_habitacion: "",
      tipo_habitacion: "",
      descripcion: "",
      capacidad: "2",
      precio_base_noche: "0",
      estado: "disponible",
      color_calendario: "#184B24",
      pendiente_revision: 0,
      airbnb_listing_id: "",
      airbnb_ical_url: "",
      airbnb_ical_activo: 0,
      airbnb_ultima_sincronizacion: "",
      airbnb_ultimo_estado: "",
      airbnb_ultimo_error: ""
    });
  };

  const save = async () => {
    setError("");
    setMessage("");
    const body: Partial<Room> = {
      ...form,
      capacidad: Number(form.capacidad || 0),
      precio_base_noche: Number(form.precio_base_noche || 0),
      estado: form.estado as Room["estado"],
      pendiente_revision: Number(form.pendiente_revision || 0),
      airbnb_ical_activo: Number(form.airbnb_ical_activo || 0)
    };
    try {
      if (editing) await api.updateRoom(editing.id, body);
      else await api.createRoom(body);
      reset();
      setMessage("Habitacion guardada.");
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la habitacion.");
    }
  };

  const testIcalLink = async () => {
    if (!editing) {
      setError("Primero guarda la habitacion para poder probar el link iCal.");
      return;
    }
    setBusyIcal(true);
    setError("");
    setMessage("");
    try {
      const result = await api.testRoomAirbnbIcal(editing.id, {
        airbnb_ical_url: form.airbnb_ical_url
      });
      setMessage(result.message || "Link iCal valido.");
      setForm((current) => ({
        ...current,
        airbnb_ultima_sincronizacion: result.room.airbnb_ultima_sincronizacion || "",
        airbnb_ultimo_estado: result.room.airbnb_ultimo_estado || "ok",
        airbnb_ultimo_error: result.room.airbnb_ultimo_error || ""
      }));
      props.onSaved();
    } catch (err) {
      const text = err instanceof Error ? err.message : "El link iCal fallo.";
      setError(text);
      setForm((current) => ({
        ...current,
        airbnb_ultimo_estado: "error",
        airbnb_ultimo_error: text
      }));
      props.onSaved();
    } finally {
      setBusyIcal(false);
    }
  };

  return (
    <section className="rooms-page">
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      <section className="work-panel">
        <h2>{editing ? "Editar habitacion" : "Crear habitacion"}</h2>
        <div className="form-grid">
          <Field label="Codigo" value={form.codigo_habitacion} onChange={(value) => setForm({ ...form, codigo_habitacion: value })} />
          <Field label="Nombre" value={form.nombre_habitacion} onChange={(value) => setForm({ ...form, nombre_habitacion: value })} />
          <Field label="Tipo" value={form.tipo_habitacion} onChange={(value) => setForm({ ...form, tipo_habitacion: value })} />
          <Field label="Capacidad" type="number" value={form.capacidad} onChange={(value) => setForm({ ...form, capacidad: value })} />
          <Field label="Precio base" type="number" value={form.precio_base_noche} onChange={(value) => setForm({ ...form, precio_base_noche: value })} />
          <label>Estado
            <select value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value })}>
              <option value="disponible">Disponible</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </label>
          <label>Color<input type="color" value={form.color_calendario} onChange={(event) => setForm({ ...form, color_calendario: event.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={Boolean(form.pendiente_revision)} onChange={(event) => setForm({ ...form, pendiente_revision: event.target.checked ? 1 : 0 })} />Pendiente de revisar</label>
          <label className="full">Descripcion<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></label>
          <section className="airbnb-ical-section full">
            <div className="airbnb-ical-header">
              <div>
                <strong>Airbnb iCal</strong>
                <span>Link privado del calendario Airbnb para esta habitacion.</span>
              </div>
              <span className={`airbnb-status ${form.airbnb_ultimo_estado || "pendiente"}`}>
                {form.airbnb_ultimo_estado || "sin probar"}
              </span>
            </div>
            <div className="form-grid">
              <Field label="ID listing Airbnb" value={form.airbnb_listing_id} onChange={(value) => setForm({ ...form, airbnb_listing_id: value })} />
              <label className="check airbnb-active"><input type="checkbox" checked={Boolean(form.airbnb_ical_activo)} onChange={(event) => setForm({ ...form, airbnb_ical_activo: event.target.checked ? 1 : 0 })} />Activo</label>
              <label className="full">URL iCal Airbnb
                <input value={form.airbnb_ical_url} onChange={(event) => setForm({ ...form, airbnb_ical_url: event.target.value })} placeholder="https://www.airbnb.com/calendar/ical/....ics" />
              </label>
              <div className="ical-status-grid full">
                <div><span>Ultima sincronizacion</span><strong>{form.airbnb_ultima_sincronizacion || "Sin dato"}</strong></div>
                <div><span>Estado</span><strong>{form.airbnb_ultimo_estado || "Sin probar"}</strong></div>
                <div><span>Ultimo error</span><strong>{form.airbnb_ultimo_error || "Sin error"}</strong></div>
              </div>
            </div>
            <div className="modal-actions">
              <button disabled={busyIcal || !editing} onClick={testIcalLink}><RefreshCw size={16} />Probar link</button>
            </div>
          </section>
        </div>
        <div className="modal-actions">
          <button onClick={reset}>Limpiar</button>
          <button className="primary" onClick={save}><Check size={17} />Guardar habitacion</button>
          <button onClick={props.onBlock}><Lock size={17} />Bloquear habitacion</button>
        </div>
      </section>

      <section className="room-table">
        <label className="search-box room-search">
          <Search size={17} />
          <input value={roomQuery} onChange={(event) => setRoomQuery(event.target.value)} placeholder="Buscar habitacion por ID/codigo..." />
        </label>
        {filteredRooms.map((room) => {
          const future = props.reservations.filter((reservation) => reservation.rooms.some((item) => item.habitacion_id === room.id)).length;
          return (
            <div className={`room-card ${room.estado === "inactiva" ? "disabled-room" : ""}`} key={room.id}>
              <span className="room-dot" style={{ background: room.color_calendario }} />
              <div>
                <strong>{room.codigo_habitacion} · {room.nombre_habitacion}</strong>
                <small>{room.tipo_habitacion || "Sin tipo"} · {room.capacidad} pax · {formatRoomPrice(room)} · {future} reservas visibles</small>
                {room.pendiente_revision ? <em>Pendiente de revisar</em> : null}
              </div>
              <button onClick={() => setEditing(room)}>Editar</button>
              <button className="danger" onClick={async () => { if (window.confirm("Desactivar esta habitacion?")) { await api.deleteRoom(room.id); props.onSaved(); } }}>Desactivar</button>
            </div>
          );
        })}
        {filteredRooms.length === 0 && <p className="empty-copy">No hay habitaciones con ese codigo.</p>}
      </section>
    </section>
  );
}

function AirbnbSyncView(props: { rooms: Room[]; onChanged: () => void }) {
  const [feeds, setFeeds] = useState<AirbnbFeed[]>([]);
  const [form, setForm] = useState({
    habitacion_id: "",
    nombre: "",
    ical_url: "",
    sync_interval_minutes: "60"
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFeeds = async () => {
    setError("");
    try {
      setFeeds(await api.airbnbFeeds());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las sincronizaciones Airbnb.");
    }
  };

  useEffect(() => {
    loadFeeds();
  }, []);

  useEffect(() => {
    if (!form.habitacion_id && props.rooms.length) {
      setForm((current) => ({ ...current, habitacion_id: String(props.rooms[0].id) }));
    }
  }, [props.rooms, form.habitacion_id]);

  const save = async () => {
    if (!form.habitacion_id || !form.ical_url.trim()) {
      setError("Selecciona una habitacion y pega el enlace .ics de Airbnb.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.createAirbnbFeed({
        habitacion_id: Number(form.habitacion_id),
        nombre: form.nombre,
        ical_url: form.ical_url,
        sync_interval_minutes: Number(form.sync_interval_minutes || 60),
        activo: 1
      });
      setForm({ habitacion_id: form.habitacion_id, nombre: "", ical_url: "", sync_interval_minutes: "60" });
      setMessage("Enlace Airbnb guardado. Puedes sincronizar ahora o esperar el ciclo automatico.");
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el enlace Airbnb.");
    } finally {
      setBusy(false);
    }
  };

  const syncFeed = async (feed: AirbnbFeed) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.syncAirbnbFeed(feed.id);
      setMessage(`Sincronizacion lista: ${result.created || 0} creadas, ${result.updated || 0} actualizadas, ${result.blocked || 0} bloqueos, ${result.cancelled || 0} canceladas, ${result.skipped || 0} omitidas.`);
      await loadFeeds();
      props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar Airbnb.");
      await loadFeeds();
    } finally {
      setBusy(false);
    }
  };

  const toggleFeed = async (feed: AirbnbFeed) => {
    setBusy(true);
    setError("");
    try {
      await api.updateAirbnbFeed(feed.id, { ...feed, activo: feed.activo ? 0 : 1 });
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la sincronizacion.");
    } finally {
      setBusy(false);
    }
  };

  const deleteFeed = async (feed: AirbnbFeed) => {
    if (!window.confirm("Eliminar esta sincronizacion Airbnb?")) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteAirbnbFeed(feed.id);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la sincronizacion.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="airbnb-page">
      <section className="work-panel">
        <div className="panel-header">
          <div>
            <strong>Sincronizacion Airbnb</strong>
            <small>Pega el enlace iCal exportado desde Airbnb para que esta app cree o actualice reservas automaticamente.</small>
          </div>
        </div>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <div className="form-grid">
          <label>Habitacion
            <select value={form.habitacion_id} onChange={(event) => setForm({ ...form, habitacion_id: event.target.value })}>
              {props.rooms.map((room) => <option key={room.id} value={room.id}>{room.codigo_habitacion} - {room.nombre_habitacion}</option>)}
            </select>
          </label>
          <Field label="Nombre del anuncio" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} />
          <Field label="Intervalo minutos" type="number" value={form.sync_interval_minutes} onChange={(value) => setForm({ ...form, sync_interval_minutes: value })} />
          <label className="full">Enlace calendario Airbnb (.ics)
            <input value={form.ical_url} onChange={(event) => setForm({ ...form, ical_url: event.target.value })} placeholder="https://www.airbnb.com/calendar/ical/..." />
          </label>
        </div>
        <div className="modal-actions">
          <button className="primary" disabled={busy || !props.rooms.length} onClick={save}><Plus size={17} />Guardar enlace</button>
        </div>
      </section>

      <section className="work-panel">
        <h2>Enlaces configurados</h2>
        {feeds.length === 0 && <p className="empty-copy">No hay calendarios Airbnb conectados todavia.</p>}
        <div className="sync-feed-list">
          {feeds.map((feed) => (
            <div className="sync-feed-card" key={feed.id}>
              <div>
                <strong>{feed.nombre}</strong>
                <small>{feed.codigo_habitacion} - {feed.nombre_habitacion}</small>
                <span>{feed.activo ? "Activo" : "Pausado"} · cada {feed.sync_interval_minutes} min</span>
                <span>Ultima sync: {feed.last_sync_at || "sin sincronizar"}</span>
                {feed.last_status && <span>{feed.last_status}</span>}
                {feed.last_error && <em>{feed.last_error}</em>}
              </div>
              <div className="sync-feed-actions">
                <button disabled={busy || !feed.activo} onClick={() => syncFeed(feed)}><RefreshCw size={16} />Sincronizar</button>
                <button disabled={busy} onClick={() => toggleFeed(feed)}>{feed.activo ? "Pausar" : "Activar"}</button>
                <button className="danger" disabled={busy} onClick={() => deleteFeed(feed)}><Trash2 size={16} />Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="work-panel">
        <div className="panel-header">
          <div>
            <strong>Nombres de huespedes Airbnb</strong>
            <small>Airbnb iCal puede ocultar el nombre. Completa aqui el nombre real y se vera en el calendario.</small>
          </div>
        </div>
        <div className="template-download">
          <div>
            <strong>Archivos Airbnb centralizados</strong>
            <span>El cargue de CSV o Excel de Airbnb ahora esta en la pestana Importar. La edicion manual de nombres queda en Reservas Airbnb.</span>
          </div>
          <span className="form-note">Usa Importar para archivos y Reservas Airbnb para nombres.</span>
        </div>
        <p className="empty-copy">La lista y edicion de nombres queda en la pestaña Reservas Airbnb.</p>
      </section>

      <section className="work-panel">
        <h2>Como sacar el enlace de Airbnb</h2>
        <div className="guide-grid">
          <div><strong>1</strong><span>En Airbnb abre el calendario del anuncio.</span></div>
          <div><strong>2</strong><span>Ve a disponibilidad o conectar calendarios.</span></div>
          <div><strong>3</strong><span>Copia el enlace de exportacion iCal y pegalo aqui.</span></div>
        </div>
      </section>
    </section>
  );
}

function AirbnbReservationsView(props: { onChanged: () => void; onSelect: (reservation: Reservation) => void }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [guestNames, setGuestNames] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadReservations = async () => {
    setError("");
    try {
      const data = await api.reservations({ origen_reserva: "airbnb" });
      setReservations(data);
      setGuestNames((current) => {
        const next = { ...current };
        data.forEach((reservation) => {
          if (next[reservation.id] === undefined) {
            next[reservation.id] = isAirbnbPlaceholderName(reservation.nombre_completo_huesped) ? "" : reservation.nombre_completo_huesped;
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las reservas Airbnb.");
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const filtered = reservations.filter((reservation) => {
    const text = [
      reservation.nombre_completo_huesped,
      reservation.numero_remision,
      reservation.telefono,
      roomLabel(reservation),
      reservation.fecha_ingreso,
      reservation.fecha_salida
    ].join(" ").toLowerCase();
    return text.includes(search.trim().toLowerCase());
  });

  const saveGuestName = async (reservation: Reservation) => {
    const name = (guestNames[reservation.id] || "").trim();
    if (!name) {
      setError("Escribe el nombre del huesped antes de guardar.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.updateReservation(reservation.id, {
        nombre_completo_huesped: name,
        origen_reserva: "airbnb",
        airbnb_ok: true
      });
      setMessage(`Nombre actualizado para ${reservation.numero_remision || reservation.id}.`);
      await loadReservations();
      props.onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el nombre.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="airbnb-page">
      <section className="work-panel">
        <div className="panel-header">
          <div>
            <strong>Reservas Airbnb</strong>
            <small>Listado separado para revisar huespedes, fechas, pagos y codigos Airbnb.</small>
          </div>
        </div>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <label className="search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre, codigo, telefono o habitacion..." />
        </label>
        {filtered.length === 0 && <p className="empty-copy">No hay reservas Airbnb para mostrar.</p>}
        <div className="airbnb-name-list">
          {filtered.map((reservation) => (
            <div className="airbnb-name-row" key={reservation.id}>
              <button className="reservation-card compact-card" onClick={() => props.onSelect(reservation)}>
                <strong>{reservation.numero_remision || `Reserva ${reservation.id}`}</strong>
                <span>{roomLabel(reservation)} · {reservation.fecha_ingreso} / {reservation.fecha_salida}</span>
                <small>{reservation.nombre_completo_huesped} · {formatMoney(reservation.total_pago)} · saldo {formatMoney(reservation.saldo)}</small>
              </button>
              <input
                value={guestNames[reservation.id] || ""}
                onChange={(event) => setGuestNames({ ...guestNames, [reservation.id]: event.target.value })}
                placeholder="Nombre real del huesped"
              />
              <button className="primary" disabled={busy || !(guestNames[reservation.id] || "").trim()} onClick={() => saveGuestName(reservation)}>
                <Check size={16} />Guardar
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function ImportView(props: { rooms: Room[]; onImported: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [roomPreview, setRoomPreview] = useState<RoomImportPreview | null>(null);
  const [airbnbFile, setAirbnbFile] = useState<File | null>(null);
  const [airbnbPreview, setAirbnbPreview] = useState<AirbnbImportPreview | null>(null);
  const [listingMappings, setListingMappings] = useState<Record<string, string>>({});
  const [force, setForce] = useState(false);
  const [roomForce, setRoomForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setPreview(await api.importPreview(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const uploadRooms = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setRoomPreview(await api.importRoomsPreview(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo de habitaciones.");
    } finally {
      setBusy(false);
    }
  };

  const uploadAirbnb = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setAirbnbFile(file);
      setListingMappings({});
      setAirbnbPreview(await api.previewAirbnbImport(file) as AirbnbImportPreview);
      setMessage("Preview Airbnb listo. Revisa alertas y confirma.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo previsualizar el archivo Airbnb.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.importConfirm(preview.sessionId, force);
      setMessage(`Importacion completada. Reservas creadas: ${result.cantidad_reservas_creadas}. Alertas: ${result.cantidad_alertas}.`);
      setPreview(null);
      props.onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRooms = async () => {
    if (!roomPreview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.importRoomsConfirm(roomPreview.sessionId, roomForce);
      setMessage(`Habitaciones actualizadas. Creadas: ${result.habitaciones_creadas}. Actualizadas: ${result.habitaciones_actualizadas}. Alertas: ${result.cantidad_alertas}.`);
      setRoomPreview(null);
      props.onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el cargue de habitaciones.");
    } finally {
      setBusy(false);
    }
  };

  const confirmAirbnbImport = async () => {
    if (!airbnbFile) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.importAirbnbNames(airbnbFile, listingMappings);
      setMessage(`Archivo Airbnb procesado. Creadas: ${result.creadas || 0}. Actualizadas: ${result.actualizadas || 0}. Pagos: ${result.pagos || 0}. Omitidas: ${result.omitidas || 0}.`);
      setAirbnbPreview(null);
      setAirbnbFile(null);
      props.onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo Airbnb.");
    } finally {
      setBusy(false);
    }
  };

  const downloadGuide = async () => {
    setError("");
    try {
      await api.downloadFile("/api/import/excel/template", "guia-importacion-reservas-hotel.xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar la guia.");
    }
  };

  const unmappedListings = useMemo(() => {
    if (!airbnbPreview) return [];
    return Array.from(new Set(
      airbnbPreview.rows
        .map((row) => String(row.data.anuncio || "").trim())
        .filter((listing) => listing && !airbnbPreview.rows.find((row) => String(row.data.anuncio || "").trim() === listing && String(row.data.habitacion || "").trim()))
    ));
  }, [airbnbPreview]);

  return (
    <section className="import-page">
      <section className="dashboard-hero">
        <div>
          <span>Cargues, descargas y guias</span>
          <h1>Importar</h1>
        </div>
      </section>
      {busy && <div className="notice">Procesando archivo...</div>}
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      <details className="work-panel import-section" open>
        <summary>Importar reservas</summary>
        <div className="upload-zone">
          <FileSpreadsheet size={36} />
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => upload(event.target.files?.[0])} />
        </div>
        {preview && (
          <section className="preview-card">
            <div className="preview-header">
              <div>
                <h2>Previsualizacion</h2>
                <p>{preview.fileName} - hoja {preview.sheetName} - {preview.totalRows} filas - {preview.canImportCount} importables sin alertas altas</p>
              </div>
              <label className="check"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />Forzar filas con alertas altas</label>
            </div>
            <div className="alert-summary">
              {preview.alerts.slice(0, 30).map((alert, index) => <div className={`alert-line ${alert.severidad}`} key={`${alert.tipo_alerta}-${index}`}>{alert.mensaje}</div>)}
              {preview.alerts.length > 30 && <small>{preview.alerts.length - 30} alertas adicionales.</small>}
            </div>
            <div className="preview-table">
              <table>
                <thead><tr><th>Fila</th><th>Nombre</th><th>Habitacion</th><th>Ingreso</th><th>Salida</th><th>Total</th><th>Abono</th><th>Alertas</th></tr></thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{String(row.data.nombre_completo_huesped || "")}</td>
                      <td>{String(row.data.codigo_habitacion_original || "")}</td>
                      <td>{String(row.data.fecha_ingreso || "")}</td>
                      <td>{String(row.data.fecha_salida || "")}</td>
                      <td>{formatMoney(Number(row.data.total_pago || 0))}</td>
                      <td>{formatMoney(Number(row.data.abono || 0))}</td>
                      <td>{row.alerts.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button onClick={() => setPreview(null)}>Cancelar</button>
              <button className="primary" onClick={confirm}><Upload size={17} />Confirmar importacion</button>
            </div>
          </section>
        )}
      </details>

      <details className="work-panel import-section">
        <summary>Importar habitaciones</summary>
        <div className="bulk-actions">
          <button onClick={() => api.downloadFile("/api/export/rooms.xlsx", "habitaciones-actuales-cargue-masivo.xlsx")}>
            <Download size={17} />Descargar habitaciones actuales
          </button>
        </div>
        <div className="upload-zone">
          <FileSpreadsheet size={36} />
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => uploadRooms(event.target.files?.[0])} />
        </div>
        <div className="template-download">
          <div>
            <strong>Actualiza sin duplicar habitaciones</strong>
            <span>El codigo interno es la llave: si existe actualiza datos y precios, si no existe crea la habitacion.</span>
          </div>
        </div>
        {roomPreview && (
          <section className="preview-card">
            <div className="preview-header">
              <div>
                <h2>Previsualizacion habitaciones</h2>
                <p>{roomPreview.fileName} - hoja {roomPreview.sheetName} - {roomPreview.totalRows} filas - {roomPreview.createCount} nuevas - {roomPreview.updateCount} para actualizar</p>
              </div>
              <label className="check"><input type="checkbox" checked={roomForce} onChange={(event) => setRoomForce(event.target.checked)} />Forzar filas con alertas altas</label>
            </div>
            <div className="alert-summary">
              {roomPreview.alerts.slice(0, 25).map((alert, index) => <div className={`alert-line ${alert.severidad}`} key={`${alert.tipo_alerta}-${index}`}>{alert.mensaje}</div>)}
              {roomPreview.alerts.length === 0 && <div className="notice success">No se detectaron alertas en el archivo de habitaciones.</div>}
            </div>
            <div className="preview-table">
              <table>
                <thead><tr><th>Fila</th><th>Accion</th><th>Codigo</th><th>Nombre</th><th>Tipo</th><th>Acomodacion</th><th>Capacidad</th><th>Valor base</th><th>Estado</th><th>Alertas</th></tr></thead>
                <tbody>
                  {roomPreview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.action}</td>
                      <td>{String(row.data.codigo_habitacion || "")}</td>
                      <td>{String(row.data.nombre_habitacion || "")}</td>
                      <td>{String(row.data.tipo_habitacion || "")}</td>
                      <td>{String(row.data.acomodacion || "")}</td>
                      <td>{String(row.data.capacidad || "")}</td>
                      <td>{row.data.estado === "inactiva" ? "Deshabilitada" : formatMoney(Number(row.data.precio_base_noche || 0))}</td>
                      <td>{String(row.data.estado || "")}</td>
                      <td>{row.alerts.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button onClick={() => setRoomPreview(null)}>Cancelar</button>
              <button className="primary" onClick={confirmRooms}><Upload size={17} />Confirmar habitaciones</button>
            </div>
          </section>
        )}
      </details>

      <details className="work-panel import-section">
        <summary>Importar Airbnb</summary>
        <div className="template-download">
          <div>
            <strong>CSV o Excel de Airbnb</strong>
            <span>Usa codigo de reserva, huesped, anuncio/listing, check-in, check-out, noches, payout y monto.</span>
          </div>
          <label className="file-button">
            <Upload size={17} />Subir archivo Airbnb
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => uploadAirbnb(event.target.files?.[0])} />
          </label>
        </div>
        {airbnbPreview && (
          <section className="preview-card">
            <div className="preview-header">
              <div>
                <h2>Preview Airbnb</h2>
                <p>{airbnbPreview.nombre_archivo} - {airbnbPreview.filas} filas - {airbnbPreview.createCount} nuevas - {airbnbPreview.updateCount} para actualizar - {airbnbPreview.alertCount} alertas</p>
              </div>
              <button className="primary" disabled={busy || (airbnbPreview.canImportCount === 0 && !Object.values(listingMappings).some(Boolean))} onClick={confirmAirbnbImport}><Upload size={17} />Confirmar cargue Airbnb</button>
            </div>
            {unmappedListings.length > 0 && (
              <div className="mapping-grid">
                {unmappedListings.map((listing) => (
                  <label key={listing}>{listing}
                    <select value={listingMappings[listing] || ""} onChange={(event) => setListingMappings({ ...listingMappings, [listing]: event.target.value })}>
                      <option value="">Selecciona habitacion</option>
                      {props.rooms.map((room) => <option key={room.id} value={room.id}>{room.codigo_habitacion} - {room.nombre_habitacion}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="preview-table">
              <table>
                <thead><tr><th>Fila</th><th>Accion</th><th>Codigo</th><th>Huesped</th><th>Anuncio</th><th>Ingreso</th><th>Salida</th><th>Habitacion</th><th>Alertas</th></tr></thead>
                <tbody>
                  {airbnbPreview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.action}</td>
                      <td>{String(row.data.code || "")}</td>
                      <td>{String(row.data.nombre_huesped || "")}</td>
                      <td>{String(row.data.anuncio || "")}</td>
                      <td>{String(row.data.fecha_ingreso || "")}</td>
                      <td>{String(row.data.fecha_salida || "")}</td>
                      <td>{String(row.data.habitacion || "")}</td>
                      <td>{row.alerts.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </details>

      <details className="work-panel import-section">
        <summary>Exportaciones</summary>
        <div className="bulk-actions">
          <button onClick={() => api.downloadFile("/api/export/reservations-excel-format.csv", "reservas-formato-excel.csv")}><Download size={17} />Reservas Excel CSV</button>
          <button onClick={() => api.downloadFile("/api/export/reservations.csv", "reservas-normalizadas.csv")}><Download size={17} />Normalizado</button>
          <button onClick={() => api.downloadFile("/api/export/rooms.csv", "habitaciones.csv")}><Download size={17} />Habitaciones CSV</button>
          <button onClick={() => api.downloadFile("/api/export/payments.csv", "pagos.csv")}><Download size={17} />Pagos CSV</button>
          <button onClick={() => api.downloadFile("/api/export/balances.csv", "saldos-pendientes.csv")}><Download size={17} />Saldos CSV</button>
        </div>
      </details>

      <details className="work-panel import-section">
        <summary>Plantillas/guias</summary>
        <div className="template-download">
          <div>
            <strong>Excel guia para importar correctamente</strong>
            <span>Incluye encabezados, ejemplo y notas para habitaciones, fechas, pagos y controles.</span>
          </div>
          <button onClick={downloadGuide}><Download size={17} />Descargar guia</button>
        </div>
      </details>
    </section>
  );
}

function MobileHome(props: {
  reservations: Reservation[];
  search: string;
  setSearch: (value: string) => void;
  onNew: () => void;
  onAvailability: () => void;
  onImport: () => void;
  onBalances: () => void;
  onSelect: (reservation: Reservation) => void;
}) {
  const todayReservations = props.reservations.filter((reservation) => reservation.fecha_ingreso <= today && effectiveEnd(reservation.fecha_ingreso, reservation.fecha_salida) > today);
  const balances = props.reservations.filter((reservation) => reservation.saldo > 0);
  return (
    <section className="mobile-home">
      <div className="mobile-actions">
        <button className="primary" onClick={props.onNew}><Plus size={20} />Nueva reserva</button>
        <button onClick={props.onAvailability}><Search size={20} />Buscar disponibilidad</button>
        <button onClick={() => props.setSearch(today)}><CalendarDays size={20} />Reservas de hoy</button>
        <button onClick={props.onBalances}><CreditCard size={20} />Saldos pendientes</button>
        <button onClick={props.onImport}><FileSpreadsheet size={20} />Importar / Exportar</button>
      </div>
      <label className="search-box">
        <Search size={18} />
        <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Buscar por nombre, cedula o remision" />
      </label>
      <h2>Reservas de hoy</h2>
      {(todayReservations.length ? todayReservations : props.reservations.slice(0, 12)).map((reservation) => (
        <button className="mobile-card" key={reservation.id} onClick={() => props.onSelect(reservation)}>
          <strong>{reservation.nombre_completo_huesped}</strong>
          <span>{roomLabel(reservation)} · {reservation.fecha_ingreso} a {reservation.fecha_salida}</span>
          <small>{formatMoney(reservation.total_pago)} · saldo {formatMoney(reservation.saldo)} · {reservation.numero_remision || "sin remision"}</small>
        </button>
      ))}
      <h2>Saldos pendientes</h2>
      {balances.slice(0, 8).map((reservation) => (
        <button className="mobile-card balance-card" key={reservation.id} onClick={() => props.onSelect(reservation)}>
          <strong>{reservation.nombre_completo_huesped}</strong>
          <span>{roomLabel(reservation)} · {formatMoney(reservation.saldo)}</span>
        </button>
      ))}
    </section>
  );
}
