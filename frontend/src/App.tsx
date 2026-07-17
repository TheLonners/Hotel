"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BadgeCheck,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleCheck,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Hash,
  Home,
  ImagePlus,
  LayoutDashboard,
  Lock,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Wallet,
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
import { extractAirbnbReservationUrl, renameReceiptFile, reservationCode } from "./lib/reservation-utils";
import { api, type ImportPreview, type RoomImportPreview } from "./services/api";
import type { AirbnbFeed, AirbnbListingDetailsResponse, Attachment, BillingAccount, Block, CleaningEvidence, CleaningReport, CleaningRoom, Dashboard, OperationRow, Reservation, Room, TodayOperations } from "./services/types";

type View = "today" | "calendar" | "cleaning" | "dashboard" | "rooms" | "airbnb" | "airbnbReservations" | "import" | "billing";

type AirbnbImportPreview = {
  nombre_archivo: string;
  profile?: "AIRBNB_PENDING" | "AIRBNB_HISTORY" | "AMBIGUOUS";
  filas: number;
  canImportCount: number;
  createCount: number;
  updateCount: number;
  alertCount: number;
  unmappedListings?: string[];
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

type ToastState = { text: string; tone?: "success" | "error" | "" } | null;

function getLatestAirbnbSyncAt(rooms: Room[]) {
  return rooms.reduce((latest, room) => (
    room.airbnb_ultima_sincronizacion > latest ? room.airbnb_ultima_sincronizacion : latest
  ), "");
}

function formatAirbnbSyncAt(value: string) {
  if (!value) return "sin dato";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota"
  }).format(parsed).replace(".", "");
}

function AirbnbSyncButton(props: { syncing: boolean; onSync: () => void; lastSyncAt: string }) {
  const syncLabel = props.syncing ? "Sincronizando Airbnb" : "Sincronizar Airbnb";
  const lastSyncLabel = props.syncing ? "Sincronizando..." : `Últ. sinc.: ${formatAirbnbSyncAt(props.lastSyncAt)}`;
  return (
    <button
      className="airbnb-sync-button outline-action"
      type="button"
      title={`${syncLabel}. ${lastSyncLabel}`}
      aria-label={`${syncLabel}. ${lastSyncLabel}`}
      disabled={props.syncing}
      onClick={props.onSync}
    >
      <span className="airbnb-sync-button-main">
        <RefreshCw size={17} className={props.syncing ? "spin" : ""} />
        <span>{props.syncing ? "Sinc..." : "Sinc."}</span>
        <img src="/logos/airbnb.svg" alt="" aria-hidden="true" />
      </span>
      <small>{lastSyncLabel}</small>
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<View>("today");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [reservationSearch, setReservationSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [reservationModal, setReservationModal] = useState<{ open: boolean; edit?: Reservation; prefill?: Record<string, unknown> }>({ open: false });
  const [blockModal, setBlockModal] = useState<Record<string, unknown> | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [airbnbSyncing, setAirbnbSyncing] = useState(false);
  const roomsRequestRef = useRef(0);
  const calendarRequestRef = useRef(0);
  const toastTimeoutRef = useRef<number | null>(null);

  const notify = (text: string, tone: "success" | "error" | "" = "success") => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ text, tone });
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 4200);
  };

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
      const [reservationData, blockData] = await Promise.all([
        api.reservations(params),
        api.blocks()
      ]);
      if (requestId !== calendarRequestRef.current) return;
      setReservations(reservationData);
      setBlocks(blockData);
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

  const syncAirbnbFromCalendar = async () => {
    setAirbnbSyncing(true);
    setError("");
    try {
      const response = await api.syncAllAirbnbFeeds();
      const results = response.results || [];
      const totals = results.reduce((summary: { created: number; updated: number; blocked: number; cancelled: number; errors: number }, result) => ({
        created: summary.created + Number(result.created || 0),
        updated: summary.updated + Number(result.updated || 0),
        blocked: summary.blocked + Number(result.blocked || 0),
        cancelled: summary.cancelled + Number(result.cancelled || 0),
        errors: summary.errors + (result.status === "error" ? 1 : 0)
      }), { created: 0, updated: 0, blocked: 0, cancelled: 0, errors: 0 });
      notify(
        totals.errors
          ? `iCal Airbnb terminado con ${totals.errors} errores. Revisa Reservas Airbnb.`
          : `iCal Airbnb actualizado: ${totals.created} creadas, ${totals.updated} actualizadas, ${totals.blocked} bloqueos y ${totals.cancelled} canceladas.`,
        totals.errors ? "error" : "success"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar Airbnb.");
    } finally {
      setAirbnbSyncing(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    loadCalendarData();
  }, [month, reservationSearch, filters]);

  useEffect(() => () => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.body.classList.add("mobile-menu-open");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("mobile-menu-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  return (
    <div className={`app-shell ${mobileMenuOpen ? "mobile-menu-open" : ""} ${view === "calendar" ? "calendar-mode" : ""} ${view === "dashboard" ? "dashboard-mode" : ""} ${view === "today" ? "today-mode" : ""} ${view === "cleaning" ? "cleaning-mode" : ""} ${view === "rooms" ? "rooms-mode" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <img src="/logos/vista-montana-instagram.png" alt="Logo Vista Montaña" />
          </span>
          <div>
            <strong>Vista Montaña</strong>
            <span>Apartasuites</span>
          </div>
        </div>
        <button
          className="menu-toggle"
          type="button"
          aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-controls="primary-navigation"
          aria-expanded={mobileMenuOpen}
          title={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <Menu size={22} />
        </button>
        <nav id="primary-navigation" className={`top-nav ${mobileMenuOpen ? "is-open" : ""}`}>
          <button type="button" className={view === "today" ? "active" : ""} onClick={() => { setView("today"); setMobileMenuOpen(false); }}><Home size={17} />Hoy</button>
          <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => { setView("calendar"); setMobileMenuOpen(false); }}><CalendarDays size={17} />Calendario</button>
          <button type="button" className={view === "cleaning" ? "active" : ""} onClick={() => { setView("cleaning"); setMobileMenuOpen(false); }}><Check size={17} />Limpieza</button>
          <button type="button" className={view === "dashboard" ? "active" : ""} onClick={() => { setView("dashboard"); setMobileMenuOpen(false); }}><LayoutDashboard size={17} />Dashboard</button>
          <button type="button" className={view === "rooms" ? "active" : ""} onClick={() => { setView("rooms"); setMobileMenuOpen(false); }}><BedDouble size={17} />Habitaciones</button>
          <button type="button" className={view === "airbnbReservations" ? "active" : ""} onClick={() => { setView("airbnbReservations"); setMobileMenuOpen(false); }}><Home size={17} />Reservas Airbnb</button>
          <button type="button" className={view === "import" ? "active" : ""} onClick={() => { setView("import"); setMobileMenuOpen(false); }}><FileSpreadsheet size={17} />Importar</button>
          <button type="button" className={view === "billing" ? "active" : ""} onClick={() => { setView("billing"); setMobileMenuOpen(false); }}><CreditCard size={17} />Cuenta de cobro</button>
        </nav>
      </header>

      {error && <div className="notice error" role="alert">{error}</div>}
      {loading && <div className="notice" role="status" aria-live="polite">Cargando datos...</div>}
      {toast && <div className={`notice ${toast.tone || ""}`} role={toast.tone === "error" ? "alert" : "status"} aria-live="polite">{toast.text}</div>}

      <main className="desktop-layout">
        {view === "calendar" && (
          <>
            <MobileCalendarAgenda
              month={month}
              setMonth={setMonth}
              reservations={reservations}
              onNew={() => setReservationModal({ open: true })}
              onBlock={(prefill) => setBlockModal(prefill || {})}
              onSelect={setSelected}
              onSyncAirbnb={syncAirbnbFromCalendar}
              airbnbSyncing={airbnbSyncing}
            />
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
              onSyncAirbnb={syncAirbnbFromCalendar}
              airbnbSyncing={airbnbSyncing}
              onChanged={load}
            />
          </>
        )}
        {view === "today" && <TodayView onSelect={setSelected} onNew={() => setReservationModal({ open: true })} />}
        {view === "cleaning" && <CleaningView onNavigate={setView} onMenuChange={setMobileMenuOpen} />}
        {view === "dashboard" && <DashboardView dashboard={null} onSelect={setSelected} onNavigate={setView} />}
        {view === "rooms" && <RoomsView rooms={rooms} reservations={reservations} onSaved={load} onBlock={() => setBlockModal({})} />}
        {view === "airbnb" && <AirbnbSyncView rooms={rooms} onChanged={load} />}
        {view === "airbnbReservations" && <AirbnbReservationsView onChanged={load} onSelect={setSelected} />}
        {view === "import" && <ImportView rooms={rooms} onImported={load} />}
        {view === "billing" && <BillingView />}
      </main>

      <MobileBottomNavigation
        view={view}
        menuOpen={mobileMenuOpen}
        onMenuChange={setMobileMenuOpen}
        onNavigate={(nextView) => {
          setView(nextView);
          setMobileMenuOpen(false);
        }}
      />

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
          onNotify={notify}
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
          onNotify={notify}
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

function MobileBottomNavigation(props: {
  view: View;
  menuOpen: boolean;
  onMenuChange: (open: boolean) => void;
  onNavigate: (view: View) => void;
}) {
  const primaryItems: { view: View; label: string; icon: ReactNode; active?: boolean }[] = [
    { view: "calendar", label: "Calendario", icon: <CalendarDays size={23} /> },
    { view: "cleaning", label: "Limpieza", icon: <Check size={23} /> },
    { view: "today", label: "Hoy", icon: <Home size={23} /> },
    { view: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={23} /> }
  ];
  const moreItems: { view: View; label: string; icon: ReactNode }[] = [
    { view: "rooms", label: "Habitaciones", icon: <BedDouble size={22} /> },
    { view: "airbnb", label: "Airbnb", icon: <Home size={22} /> },
    { view: "import", label: "Importar", icon: <Download size={22} /> },
    { view: "airbnbReservations", label: "Reservas", icon: <FileText size={22} /> },
    { view: "billing", label: "Cuenta de cobro", icon: <CreditCard size={22} /> }
  ];
  const moreActive = moreItems.some((item) => item.view === props.view);

  return (
    <nav className="mobile-bottom-navigation" aria-label="Navegacion principal movil">
      {props.menuOpen && (
        <div className="mobile-more-popover" role="menu" aria-label="Mas opciones">
          {moreItems.map((item) => (
            <button key={item.view} type="button" role="menuitem" onClick={() => props.onNavigate(item.view)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mobile-bottom-bar">
        {primaryItems.map((item) => {
          const active = item.active ?? props.view === item.view;
          return (
            <button key={item.label} type="button" className={active ? "active" : ""} onClick={() => props.onNavigate(item.view)}>
              {item.icon}<span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" className={moreActive || props.menuOpen ? "active more-button" : "more-button"} aria-expanded={props.menuOpen} onClick={() => props.onMenuChange(!props.menuOpen)}>
          <Menu size={24} /><span>Mas</span>
        </button>
      </div>
    </nav>
  );
}

function MobileCalendarAgenda(props: {
  month: string;
  setMonth: (month: string) => void;
  reservations: Reservation[];
  onNew: () => void;
  onBlock: (prefill?: Record<string, unknown>) => void;
  onSelect: (reservation: Reservation) => void;
  onSyncAirbnb: () => void;
  airbnbSyncing: boolean;
}) {
  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState<"todos" | "airbnb" | "whatsapp">("todos");
  const visibleReservations = props.reservations.filter((reservation) => {
    const activeOnDate = reservation.estado_reserva !== "cancelada" && date >= reservation.fecha_ingreso && date < effectiveEnd(reservation.fecha_ingreso, reservation.fecha_salida);
    return activeOnDate && (channel === "todos" || reservation.origen_reserva === channel);
  });
  const dateLabel = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(parseDate(date));
  const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseDate(`${props.month}-01`));

  return (
    <section className="mobile-calendar-reference">
      <div className="mobile-calendar-heading">
        <div><h1>Calendario</h1><p>Organiza y gestiona tus reservas</p></div>
        <div className="mobile-calendar-actions">
          <button className="outline-action" type="button" disabled={props.airbnbSyncing} onClick={props.onSyncAirbnb} title="Sincroniza los iCal activos de Airbnb">
            <RefreshCw size={18} className={props.airbnbSyncing ? "spin" : ""} />
          </button>
          <button className="primary" onClick={props.onNew}><Plus size={20} />Nueva reserva</button>
        </div>
      </div>
      <div className="mobile-month-switcher">
        <button className="icon" aria-label="Mes anterior" onClick={() => props.setMonth(shiftMonth(props.month, -1))}><ChevronLeft size={20} /></button>
        <span><CalendarDays size={19} />{monthLabel}</span>
        <button className="icon" aria-label="Mes siguiente" onClick={() => props.setMonth(shiftMonth(props.month, 1))}><ChevronRight size={20} /></button>
      </div>
      <div className="mobile-calendar-tabs" aria-label="Vista del calendario"><span className="active" aria-current="page">Día</span></div>
      <div className="mobile-calendar-filters">
        <select aria-label="Canal" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="todos">Canal: Todos</option><option value="airbnb">Canal: Airbnb</option><option value="whatsapp">Canal: WhatsApp</option></select>
        <input aria-label="Fecha de agenda" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      <section className="mobile-agenda-card">
        <header><span>{dateLabel}</span><button onClick={() => props.onBlock({ fecha_inicio: date, fecha_fin: addDays(date, 1) })}><Lock size={16} />Bloquear dia</button></header>
        <small>{visibleReservations.length} {visibleReservations.length === 1 ? "reserva" : "reservas"}</small>
        <div className="mobile-agenda-list">
          {visibleReservations.map((reservation) => {
            const isAirbnb = reservation.origen_reserva === "airbnb";
            const pending = reservation.estado_reserva === "pendiente";
            return <button key={reservation.id} className={`mobile-agenda-row ${isAirbnb ? "airbnb" : pending ? "pending" : "whatsapp"}`} onClick={() => props.onSelect(reservation)}>
              <span className="mobile-agenda-icon"><BedDouble size={23} /></span>
              <span><strong>{roomLabel(reservation) || "Habitacion"}</strong><em>{reservation.nombre_completo_huesped || "Huesped sin nombre"}</em><small><CalendarDays size={14} />{reservation.fecha_ingreso.slice(5)} - {reservation.fecha_salida.slice(5)} · {Math.max(1, diffDays(reservation.fecha_ingreso, reservation.fecha_salida))} noches</small></span>
              <b><img className="mobile-channel-logo" src={`/logos/${isAirbnb ? "airbnb" : "whatsapp"}.svg`} alt={isAirbnb ? "Airbnb" : "WhatsApp"} />{isAirbnb ? "Airbnb" : pending ? "Pendiente" : "WhatsApp"}<i>{formatMoney(reservation.total_pago)}</i></b><ChevronRight size={18} />
            </button>;
          })}
          {visibleReservations.length === 0 && <p className="empty-copy">No hay reservas para esta fecha.</p>}
        </div>
      </section>
    </section>
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
  onSyncAirbnb: () => void;
  airbnbSyncing: boolean;
  onChanged: () => void;
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
  const calendarScrollAnchorRef = useRef<{ date: string; offset: number } | null>(null);
  const requestedCalendarMonthRef = useRef<string | null>(null);
  const ignoreInitialCalendarScrollRef = useRef(true);
  const suppressCalendarExtensionRef = useRef(false);
  const calendarRangeLabel = `${days[0]} -> ${days[days.length - 1]}`;
  const lastAirbnbSyncAt = useMemo(() => getLatestAirbnbSyncAt(props.rooms), [props.rooms]);
  const activeReservations = props.reservations.filter((reservation) => reservation.estado_reserva !== "cancelada");
  const checkinsTodayAll = activeReservations.filter((reservation) => reservation.fecha_ingreso === today);
  const checkinsToday = checkinsTodayAll.slice(0, 3);
  const staysToday = activeReservations.filter((reservation) => today >= reservation.fecha_ingreso && today < effectiveEnd(reservation.fecha_ingreso, reservation.fecha_salida)).slice(0, 3);
  const paymentAlerts = activeReservations.filter((reservation) => Number(reservation.saldo || 0) > 0).length;
  const blockedToday = props.blocks.filter((block) => today >= block.fecha_inicio && today < effectiveEnd(block.fecha_inicio, block.fecha_fin)).length;
  const availableToday = Math.max(0, props.rooms.length - staysToday.length - blockedToday);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [checkinsDetailOpen, setCheckinsDetailOpen] = useState(false);
  const setReservationFilter = (key: string, value: string) => {
    props.setFilters({ ...props.filters, [key]: props.filters[key] === value ? "" : value });
  };

  const scrollToDate = (date: string) => {
    const index = days.indexOf(date);
    if (index < 0 || !calendarScrollRef.current) return;
    suppressCalendarExtensionRef.current = true;
    calendarScrollRef.current.scrollTo({
      left: Math.max(0, index * dayWidth - dayWidth),
      behavior: "auto"
    });
    window.requestAnimationFrame(() => {
      suppressCalendarExtensionRef.current = false;
    });
  };

  const goToday = () => {
    props.setMonth(currentMonth);
    window.setTimeout(() => scrollToDate(today), 80);
  };

  useEffect(() => {
    const scrollElement = calendarScrollRef.current;
    const anchor = calendarScrollAnchorRef.current;
    if (scrollElement && anchor) {
      const index = days.indexOf(anchor.date);
      if (index >= 0) {
        scrollElement.scrollLeft = index * dayWidth + anchor.offset;
        calendarScrollAnchorRef.current = null;
        requestedCalendarMonthRef.current = null;
        return;
      }
    }

    requestedCalendarMonthRef.current = null;
    ignoreInitialCalendarScrollRef.current = true;
    if (props.month === currentMonth) {
      window.setTimeout(() => scrollToDate(today), 80);
    } else if (scrollElement) {
      scrollElement.scrollLeft = 0;
    }
  }, [props.month, days.join("|")]);

  const extendCalendar = (direction: -1 | 1) => {
    const scrollElement = calendarScrollRef.current;
    if (!scrollElement) return;

    const targetMonth = shiftMonth(props.month, direction);
    if (requestedCalendarMonthRef.current === targetMonth) return;

    const index = Math.max(0, Math.min(days.length - 1, Math.floor(scrollElement.scrollLeft / dayWidth)));
    calendarScrollAnchorRef.current = {
      date: days[index],
      offset: scrollElement.scrollLeft - index * dayWidth
    };
    requestedCalendarMonthRef.current = targetMonth;
    props.setMonth(targetMonth);
  };

  const handleCalendarScroll = () => {
    syncVerticalScroll("calendar");
    if (suppressCalendarExtensionRef.current) return;
    if (ignoreInitialCalendarScrollRef.current) {
      ignoreInitialCalendarScrollRef.current = false;
      return;
    }
    const scrollElement = calendarScrollRef.current;
    if (!scrollElement || requestedCalendarMonthRef.current) return;

    const threshold = dayWidth * 7;
    if (scrollElement.scrollLeft <= threshold) {
      extendCalendar(-1);
    } else if (scrollElement.scrollLeft + scrollElement.clientWidth >= scrollElement.scrollWidth - threshold) {
      extendCalendar(1);
    }
  };

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
      <div className="calendar-hero">
        <div className="calendar-title">
          <h1>Calendario</h1>
        </div>
        <div className="calendar-hero-actions">
          <input type="month" value={props.month} onChange={(event) => props.setMonth(event.target.value)} aria-label="Mes del calendario" />
          <div className="month-stepper">
            <button className="icon" title="Mes anterior" onClick={() => props.setMonth(shiftMonth(props.month, -1))}><ChevronLeft size={18} /></button>
            <button className="calendar-today-button" type="button" onClick={goToday}><CalendarDays size={16} />Hoy</button>
            <button className="icon" title="Mes siguiente" onClick={() => props.setMonth(shiftMonth(props.month, 1))}><ChevronRight size={18} /></button>
          </div>
          <span className="calendar-range-pill"><CalendarDays size={16} />{calendarRangeLabel}</span>
          <button className="primary" onClick={() => props.onNew()}><Plus size={17} />Nueva reserva</button>
          <button className="outline-action" onClick={() => props.onBlock()}><Lock size={17} />Bloquear habitacion</button>
          <AirbnbSyncButton syncing={props.airbnbSyncing} onSync={props.onSyncAirbnb} lastSyncAt={lastAirbnbSyncAt} />
        </div>
      </div>

      <div className="filter-row">
        <label className="search-box room-search">
          <BedDouble size={17} />
          <input aria-label="Buscar habitación" value={props.roomSearch} onChange={(event) => props.setRoomSearch(event.target.value)} placeholder="Buscar habitacion..." />
        </label>
        <label className="search-box guest-search">
          <Search size={17} />
          <input aria-label="Buscar huésped o reserva" value={props.reservationSearch} onChange={(event) => props.setReservationSearch(event.target.value)} placeholder="Buscar huesped o reserva..." />
        </label>
        <div className="calendar-chip-group">
          <button className={!props.filters.origen_reserva ? "active" : ""} onClick={() => props.setFilters({ ...props.filters, origen_reserva: "" })}>Todas</button>
          <button className={props.filters.origen_reserva === "airbnb" ? "active soft" : ""} onClick={() => setReservationFilter("origen_reserva", "airbnb")}><img src="/logos/airbnb.svg" alt="" />Airbnb</button>
          <button className={props.filters.origen_reserva === "whatsapp" ? "active soft" : ""} onClick={() => setReservationFilter("origen_reserva", "whatsapp")}><img src="/logos/whatsapp.svg" alt="" />WhatsApp</button>
        </div>
        <details className="status-filter-menu">
          <summary>
            <span className={`dot ${props.filters.estado_reserva === "confirmada" ? "green" : props.filters.estado_reserva === "pendiente" ? "orange" : props.filters.estado_reserva === "finalizada" ? "gray" : "all"}`} />
            {props.filters.estado_reserva ? props.filters.estado_reserva.charAt(0).toUpperCase() + props.filters.estado_reserva.slice(1) : "Estado"}
          </summary>
          <div className="status-filter-panel">
            <button className={!props.filters.estado_reserva ? "active" : ""} onClick={() => props.setFilters({ ...props.filters, estado_reserva: "" })}>Todos</button>
            <button className={props.filters.estado_reserva === "confirmada" ? "active soft" : ""} onClick={() => setReservationFilter("estado_reserva", "confirmada")}><span className="dot green" />Confirmada</button>
            <button className={props.filters.estado_reserva === "pendiente" ? "active soft" : ""} onClick={() => setReservationFilter("estado_reserva", "pendiente")}><span className="dot orange" />Pendiente</button>
            <button className={props.filters.estado_reserva === "finalizada" ? "active soft" : ""} onClick={() => setReservationFilter("estado_reserva", "finalizada")}><span className="dot gray" />Finalizada</button>
          </div>
        </details>
        <details className="filter-menu">
          <summary>Mas</summary>
          <div className="filter-menu-panel">
            <label><input type="checkbox" checked={Boolean(props.filters.saldo_pendiente)} onChange={(event) => props.setFilters({ ...props.filters, saldo_pendiente: event.target.checked ? "1" : "" })} /> Saldos pendientes</label>
            <label><input type="checkbox" checked={Boolean(props.filters.con_alertas)} onChange={(event) => props.setFilters({ ...props.filters, con_alertas: event.target.checked ? "1" : "" })} /> Con alertas</label>
            <label><input type="checkbox" checked={Boolean(props.filters.sin_comprobante)} onChange={(event) => props.setFilters({ ...props.filters, sin_comprobante: event.target.checked ? "1" : "" })} /> Sin comprobante</label>
          </div>
        </details>
        <button onClick={props.onAvailability}>Disponibilidad</button>
        <button className="summary-toggle" type="button" aria-pressed={!sidePanelCollapsed} onClick={() => setSidePanelCollapsed((value) => !value)}>Resumen</button>
      </div>

      <div className={`calendar-stage-grid ${sidePanelCollapsed ? "side-panel-hidden" : ""}`}>
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
                {room.foto_url ? (
                  <img className="calendar-room-photo" src={room.foto_url} alt={`Habitación ${room.codigo_habitacion}`} />
                ) : (
                  <span className="room-dot" style={{ background: room.color_calendario }} />
                )}
                <div>
                  <strong>{room.codigo_habitacion}</strong>
                <small>{room.nombre_habitacion} · {room.capacidad} pax</small>
              </div>
            </div>
          ))}
            <div className="calendar-bottom-spacer" />
          </div>
        </div>
        <div className="calendar-scroll" ref={calendarScrollRef} onScroll={handleCalendarScroll}>
          <div className="date-grid" style={{ width: days.length * dayWidth }}>
            <div className="date-header">
              {days.map((day) => (
                <div className={`date-cell ${day === today ? "today" : ""}`} key={day}>
                  <small>{new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" }).format(parseDate(day)).replace(".", "")}</small>
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
        <aside className={`calendar-side-panel ${sidePanelCollapsed ? "collapsed" : ""}`}>
          <div className="calendar-side-panel-header">
            <strong>Resumen del día</strong>
            <button
              className="icon"
              type="button"
              title={sidePanelCollapsed ? "Mostrar panel" : "Minimizar panel"}
              aria-label={sidePanelCollapsed ? "Mostrar panel" : "Minimizar panel"}
              onClick={() => setSidePanelCollapsed((value) => !value)}
            >
              {sidePanelCollapsed ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>
          {sidePanelCollapsed && <span className="calendar-side-panel-collapsed-label">Mostrar resumen</span>}
          {!sidePanelCollapsed && <div className="calendar-side-panel-content">
          <section className="calendar-side-card alerts">
            <h3><AlertCircle size={18} />Alertas</h3>
            <div className="alert-item">
              <X size={15} />
              <span><strong>{paymentAlerts}</strong> pagos pendientes</span>
            </div>
            <div className="alert-item">
              <CalendarDays size={15} />
              <span><strong>{blockedToday}</strong> habitaciones bloqueadas</span>
            </div>
          </section>
          <section className="calendar-side-card calendar-stats">
            <div><strong>{activeReservations.length}</strong><span>Reservas activas</span></div>
            <div><strong>{availableToday}</strong><span>Disponibles</span></div>
            <div><strong>{blockedToday}</strong><span>Bloqueadas</span></div>
          </section>
          <section className="calendar-side-card checkins-card">
            <div className="calendar-side-card-title">
              <h3><Users size={18} />Ingresan hoy ({checkinsTodayAll.length})</h3>
              {checkinsTodayAll.length > 3 && (
                <button className="calendar-more-button" type="button" onClick={() => setCheckinsDetailOpen(true)}>
                  Ver más
                </button>
              )}
            </div>
            <div className="checkins-list">
              {checkinsToday.map((reservation) => {
                const payment = reservation.payments[0];
                const hasArrived = Boolean(reservation.llegada_verificada);
                return (
                  <button className="calendar-mini-row checkin-row" key={reservation.id} onClick={() => props.onSelect(reservation)}>
                    <span>{reservation.nombre_completo_huesped.slice(0, 1) || "V"}</span>
                    <div>
                      <strong>{reservation.nombre_completo_huesped}</strong>
                      <small>{roomLabel(reservation)} · Ingreso {reservation.fecha_ingreso}</small>
                    </div>
                    <div className="checkin-meta">
                      <b className={hasArrived ? "arrival-confirmed" : "arrival-pending"} title={hasArrived ? "Llegó" : "No verificado"}>{hasArrived ? "✓" : "x"}</b>
                      <small>{payment?.banco_o_medio || reservation.banco_o_medio_pago || reservation.metodo_pago || "Sin pago"}</small>
                      <small className={reservation.attachments.length > 0 ? "receipt-present" : "receipt-missing"}>{reservation.attachments.length > 0 ? "Comprobante" : "Sin comprobante"}</small>
                    </div>
                  </button>
                );
              })}
            </div>
            {checkinsTodayAll.length === 0 && <p className="empty-copy">Sin ingresos para hoy.</p>}
          </section>
          <section className="calendar-side-card">
            <h3><Users size={18} />Reservas activas ({staysToday.length})</h3>
            {staysToday.map((reservation) => (
              <button className="calendar-mini-row" key={reservation.id} onClick={() => props.onSelect(reservation)}>
                <span>{reservation.nombre_completo_huesped.slice(0, 1) || "V"}</span>
                <div><strong>{reservation.nombre_completo_huesped}</strong><small>{roomLabel(reservation)} Â· {channelLabel(reservation.origen_reserva)}</small></div>
                <b>{formatMoney(reservation.total_pago)}</b>
              </button>
            ))}
            {staysToday.length === 0 && <p className="empty-copy">Sin hospedados activos hoy.</p>}
          </section>
          </div>}
        </aside>
      </div>
      {checkinsDetailOpen && <CheckinsDetailPanel reservations={checkinsTodayAll} onClose={() => setCheckinsDetailOpen(false)} onChanged={props.onChanged} />}
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

function CheckinsDetailPanel(props: { reservations: Reservation[]; onClose: () => void; onChanged: () => void }) {
  return (
    <aside className="checkins-detail-panel">
      <div className="checkins-detail-header">
        <div>
          <span>Ingresos del día</span>
          <strong>Lista completa de llegadas</strong>
          <small>{props.reservations.length} reservas programadas para hoy</small>
        </div>
        <button className="icon" type="button" title="Cerrar ingresos del día" onClick={props.onClose}><X size={20} /></button>
      </div>
      <div className="checkins-detail-table-wrap">
        <div className="checkins-detail-table">
          <div className="checkins-detail-row checkins-detail-head">
            <span>Ingreso</span><span>Habitación</span><span>Huésped</span><span>Celular</span><span>Llegada</span><span>Medio de pago</span><span>Comprobante</span>
          </div>
          {props.reservations.map((reservation) => {
            const payment = reservation.payments[0];
            const hasArrived = Boolean(reservation.llegada_verificada);
            return (
              <div className="checkins-detail-row" key={reservation.id}>
                <span>{reservation.fecha_ingreso}</span>
                <strong>{roomLabel(reservation)}</strong>
                <strong>{reservation.nombre_completo_huesped}</strong>
                <span className="checkin-phone">{reservation.telefono || "Sin registrar"}</span>
                <button
                  className={`arrival-toggle ${hasArrived ? "arrival-confirmed" : "arrival-pending"}`}
                  type="button"
                  title={hasArrived ? "Marcar como pendiente" : "Marcar huésped como llegado"}
                  onClick={async () => {
                    await api.updateArrival(reservation.id, !hasArrived);
                    await props.onChanged();
                  }}
                >
                  <span className="arrival-checkbox" aria-hidden="true">
                    {hasArrived ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span>{hasArrived ? "Llegó" : "Pendiente"}</span>
                </button>
                <span>{payment?.banco_o_medio || reservation.banco_o_medio_pago || reservation.metodo_pago || "Sin registrar"}</span>
                <span className={reservation.attachments.length > 0 ? "receipt-present" : "receipt-missing"}>{reservation.attachments.length > 0 ? "Sí" : "No"}</span>
              </div>
            );
          })}
          {props.reservations.length === 0 && <p className="empty-copy">No hay ingresos programados para hoy.</p>}
        </div>
      </div>
    </aside>
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
  const isAirbnbBlock = (block: Block) => block.origen_bloqueo === "airbnb" || block.tipo_bloqueo === "airbnb";

  const position = (start: string, end: string) => {
    const occupancyEnd = effectiveEnd(start, end);
    if (occupancyEnd <= monthStart || start >= monthEnd) return null;

    const visibleStart = start < monthStart ? monthStart : start;
    const visibleEnd = occupancyEnd > monthEnd ? monthEnd : occupancyEnd;
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
      !isAirbnbBlock(block) &&
      day >= block.fecha_inicio && day < effectiveEnd(block.fecha_inicio, block.fecha_fin)
    );
    return hasReservation || hasBlock;
  };

  return (
    <div className={`calendar-row ${props.room.estado === "inactiva" ? "disabled-room-row" : ""}`} style={{ width: props.days.length * props.dayWidth }}>
      {props.days.map((day) => {
        const busy = isBusy(day);
        const hasAirbnbBlock = roomBlocks.some((block) =>
          isAirbnbBlock(block) && day >= block.fecha_inicio && day < effectiveEnd(block.fecha_inicio, block.fecha_fin)
        );
        return (
          <button
            type="button"
            className={`day-slot ${day === today ? "today-line" : ""}`}
            key={day}
            disabled={busy}
            aria-label={busy
              ? `${props.room.codigo_habitacion}, ${day}: no disponible`
              : hasAirbnbBlock
                ? `${props.room.codigo_habitacion}, ${day}: Airbnb bloqueado; crear reserva directa`
              : `Crear reserva o bloqueo en ${props.room.codigo_habitacion} para ${day}`}
            title={busy ? "" : hasAirbnbBlock ? "Airbnb bloqueado; crear reserva directa" : `Crear accion en ${props.room.codigo_habitacion} - ${day}`}
            onClick={(event) => props.onEmptyCell(props.room, day, event.currentTarget.getBoundingClientRect())}
          />
        );
      })}
      {roomBlocks.map((block) => {
        const style = position(block.fecha_inicio, block.fecha_fin);
        if (!style) return null;
        const isAirbnb = block.origen_bloqueo === "airbnb" || block.tipo_bloqueo === "airbnb";
        const isEvent = block.tipo_bloqueo === "evento" || block.origen_bloqueo === "evento";
        return (
          <button
            className={`${isAirbnb ? "airbnb-block-chip" : "block-bar"} ${isEvent ? "event-block" : ""}`}
            key={block.id}
            style={{ left: style.left, width: style.width }}
            title={block.motivo}
            onClick={(event) => isAirbnb
              ? props.onEmptyCell(props.room, block.fecha_inicio, event.currentTarget.getBoundingClientRect())
              : props.onBlockSelect(block)}
          >
            {block.motivo || "Bloqueado"}
          </button>
        );
      })}
      {roomReservations.map((reservation) => {
        const style = position(reservation.fecha_ingreso, reservation.fecha_salida);
        if (!style) return null;
        return (
          <button
            className={`reservation-bar ${paymentClass(reservation.estado_pago)} ${reservation.estado_reserva === "cancelada" ? "cancelled" : ""}`}
            key={`${reservation.id}-${props.room.id}`}
            style={{ left: style.left, width: style.width }}
            onClick={() => props.onSelect(reservation)}
            data-tooltip={`${reservation.nombre_completo_huesped || "Sin huésped"} · ${reservation.numero_interno || reservation.numero_remision || `Reserva #${reservation.id}`}`}
            title={`${reservation.nombre_completo_huesped || "Sin huésped"} · ${formatMoney(reservation.total_pago)} · saldo ${formatMoney(reservation.saldo)}`}
            aria-label={`${reservation.nombre_completo_huesped || "Sin huésped"}. ${roomLabel(reservation)}. ${reservation.numero_remision || `Reserva ${reservation.id}`}`}
          >
            <img
              className="reservation-channel-logo"
              src={`/logos/${reservation.origen_reserva === "airbnb" ? "airbnb" : "whatsapp"}.svg`}
              alt={reservation.origen_reserva === "airbnb" ? "Airbnb" : "WhatsApp"}
            />
            <strong>{reservation.nombre_completo_huesped}</strong>
            <span>{roomLabel(reservation)} · {formatMoney(reservation.saldo)} · {reservation.numero_remision || "sin remision"}</span>
          </button>
        );
      })}
    </div>
  );
}

function DetailPanel(props: { reservation: Reservation; onClose: () => void; onEdit: () => void; onChanged: () => void; onNotify: (text: string, tone?: "success" | "error" | "") => void }) {
  const [payment, setPayment] = useState({ monto: "", fecha_pago: today, metodo_pago: "transferencia", banco_o_medio: "", referencia_pago: "", nota: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [remisionValue, setRemisionValue] = useState(props.reservation.numero_remision || "");
  const [remisionSaving, setRemisionSaving] = useState(false);
  const [remisionMessage, setRemisionMessage] = useState("");
  const [airbnbGuestName, setAirbnbGuestName] = useState("");
  const [airbnbGuestSaving, setAirbnbGuestSaving] = useState(false);
  const [airbnbGuestMessage, setAirbnbGuestMessage] = useState("");
  const reservation = props.reservation;
  const isAirbnbReservation = reservation.origen_reserva.trim().toLowerCase() === "airbnb";
  const needsAirbnbGuestReview = isAirbnbReservation
    && (!reservation.nombre_completo_huesped.trim() || isAirbnbPlaceholderName(reservation.nombre_completo_huesped));
  const airbnbIcalUrl = reservation.rooms.find((room) => room.airbnb_ical_url?.trim())?.airbnb_ical_url.trim() || "";
  const airbnbReservationUrl = extractAirbnbReservationUrl(reservation.observaciones);
  const airbnbValidationUrl = airbnbIcalUrl || airbnbReservationUrl;

  useEffect(() => {
    setRemisionValue(props.reservation.numero_remision || "");
    setRemisionMessage("");
    const currentName = props.reservation.nombre_completo_huesped || "";
    setAirbnbGuestName(isAirbnbPlaceholderName(currentName) ? "" : currentName);
    setAirbnbGuestMessage("");
  }, [props.reservation.id, props.reservation.numero_remision, props.reservation.nombre_completo_huesped]);

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
      props.onNotify("Pago registrado.", "success");
      refreshReservation();
    } catch (err) {
      props.onNotify(err instanceof Error ? err.message : "No se pudo registrar el pago.", "error");
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
      const safeFile = renameReceiptFile(file, reservation.nombre_completo_huesped);
      form.set("file", safeFile);
      await api.uploadAttachment(reservation.id, form);
      setFile(null);
      setUploadNote("");
      props.onNotify("Comprobante adjuntado.", "success");
      refreshReservation();
    } catch (err) {
      props.onNotify(err instanceof Error ? err.message : "No se pudo adjuntar el comprobante.", "error");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (estado_reserva: string) => {
    await api.updateReservation(reservation.id, { ...reservation, roomIds: reservation.rooms.map((room) => room.habitacion_id), estado_reserva });
    refreshReservation();
  };

  const saveAirbnbGuestName = async () => {
    const name = airbnbGuestName.trim();
    if (!name) {
      setAirbnbGuestMessage("Escribe el nombre del huesped antes de guardar.");
      return;
    }
    setAirbnbGuestSaving(true);
    setAirbnbGuestMessage("");
    try {
      await api.updateReservation(reservation.id, {
        nombre_completo_huesped: name,
        origen_reserva: "airbnb",
        airbnb_ok: true
      });
      setAirbnbGuestMessage("Nombre actualizado correctamente.");
      refreshReservation();
    } catch (err) {
      setAirbnbGuestMessage(err instanceof Error ? err.message : "No se pudo actualizar el nombre.");
    } finally {
      setAirbnbGuestSaving(false);
    }
  };

  return (
    <aside className="detail-panel reservation-detail-panel" role="dialog" aria-modal="true" aria-labelledby="reservation-detail-title">
      <header className="panel-header reservation-detail-header">
        <div className="reservation-detail-heading">
          <div>
          <span className={`status-dot ${paymentClass(reservation.estado_pago)}`} />
          <strong id="reservation-detail-title">{reservation.nombre_completo_huesped}</strong>
          <small>Reserva #{reservation.id} · {reservationCode(reservation)} · <b>{reservation.estado_reserva}</b></small>
          </div>
        </div>
        <button className="icon" type="button" aria-label="Cerrar detalle de reserva" title="Cerrar detalle de reserva" onClick={props.onClose}><X size={20} /></button>
      </header>

      <div className="panel-section money-summary">
        <div className="reservation-money-card total"><span className="reservation-money-icon"><Wallet size={24} /></span><div><span>Total</span><strong>{formatMoney(reservation.total_pago)}</strong></div></div>
        <div className="reservation-money-card paid"><span className="reservation-money-icon"><CircleCheck size={25} /></span><div><span>Abonado</span><strong>{formatMoney(reservation.abono)}</strong></div></div>
        <div className="reservation-money-card balance"><span className="reservation-money-icon"><CircleDollarSign size={25} /></span><div><span>Saldo</span><strong>{formatMoney(reservation.saldo)}</strong></div></div>
      </div>

      <section className="panel-section reservation-remission-card">
        <h3>No. remision</h3>
        <div className="mini-form inline-form reservation-remission-form">
          <input value={remisionValue} onChange={(event) => setRemisionValue(event.target.value)} placeholder="N. remision" />
          <button className="primary" disabled={remisionSaving} onClick={saveRemision}><Save size={17} />{remisionSaving ? "Guardando..." : "Guardar"}</button>
        </div>
        {remisionMessage && <small className="form-note">{remisionMessage}</small>}
      </section>

      <section className="panel-section reservation-details-card">
        <h3><CalendarDays size={20} />Detalles de la reserva</h3>
        <div className="reservation-detail-grid">
          <div className="reservation-detail-column">
            <div><span>Habitación</span><strong>{roomLabel(reservation) || "Sin asignar"}</strong></div>
            <div><span>Ingreso</span><strong>{reservation.fecha_ingreso}</strong></div>
            <div><span>Salida</span><strong>{reservation.fecha_salida}</strong></div>
            <div><span>Noches</span><strong>{reservation.noches}</strong></div>
            <div><span>Huéspedes</span><strong>{reservation.cantidad_huespedes}</strong></div>
          </div>
          <div className="reservation-detail-column">
            <div><span>Cédula</span><strong>{reservation.cedula || "Sin dato"}</strong></div>
            <div><span>Teléfono</span><strong>{reservation.telefono || "Sin dato"}</strong></div>
            <div><span>Correo</span><strong>{reservation.correo || "Sin dato"}</strong></div>
            <div><span>Dirección</span><strong>{reservation.direccion || "Sin dato"}</strong></div>
            <div><span>Banco/medio</span><strong>{reservation.banco_o_medio_pago || "Sin dato"}</strong></div>
          </div>
        </div>
      </section>

      {needsAirbnbGuestReview && (
        <div className="panel-section airbnb-validation-section">
          <div className="airbnb-validation-heading">
            <div>
              <h3>Validar reserva Airbnb</h3>
              <small>Esta reserva no trae el nombre del huésped desde el iCal.</small>
            </div>
            {airbnbValidationUrl && (
              <a className="airbnb-ical-button" href={airbnbValidationUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />{airbnbIcalUrl ? "Abrir URL iCal" : "Abrir reserva Airbnb"}
              </a>
            )}
          </div>
          {airbnbIcalUrl && <code className="airbnb-ical-url">{airbnbIcalUrl}</code>}
          {!airbnbIcalUrl && airbnbReservationUrl && <code className="airbnb-ical-url">{airbnbReservationUrl}</code>}
          {!airbnbIcalUrl && airbnbReservationUrl && <small className="form-note">No hay un feed iCal configurado para la habitación; se encontró el enlace de la reserva en la descripción.</small>}
          {!airbnbValidationUrl && <small className="form-note">No se encontró una URL iCal ni un enlace de reserva de Airbnb.</small>}
          <div className="airbnb-guest-form">
            <label htmlFor="airbnb-guest-name">Nombre del huésped</label>
            <div className="mini-form inline-form">
              <input id="airbnb-guest-name" value={airbnbGuestName} onChange={(event) => setAirbnbGuestName(event.target.value)} placeholder="Escribe el nombre real del huésped" />
              <button className="primary" disabled={airbnbGuestSaving || !airbnbGuestName.trim()} onClick={saveAirbnbGuestName}>
                <Save size={16} />{airbnbGuestSaving ? "Guardando..." : "Guardar nombre"}
              </button>
            </div>
            {airbnbGuestMessage && <small className="form-note">{airbnbGuestMessage}</small>}
          </div>
        </div>
      )}

      <div className="panel-section chips">
        <span className={reservation.airbnb_ok ? "chip ok" : "chip"}>AIRBNB</span>
        <span className={reservation.whatsapp_ok ? "chip ok" : "chip"}>WHAT</span>
        <span className={reservation.siigo_ok ? "chip ok" : "chip"}>SIIGO</span>
        <span className={reservation.queo_ok ? "chip ok" : "chip"}>QUEO</span>
      </div>

      {isAirbnbReservation && (
        <details className="reservation-airbnb-sync-card">
          <summary>
            <span><RefreshCw size={22} /></span>
            <div><strong>Sincronizada con Airbnb</strong><small>La reserva se sincroniza automáticamente desde Airbnb iCal.</small></div>
            <ChevronRight size={21} />
          </summary>
          {reservation.observaciones && <p className="notes">{reservation.observaciones}</p>}
        </details>
      )}
      {!isAirbnbReservation && reservation.observaciones && <p className="notes reservation-notes">{reservation.observaciones}</p>}

      {reservation.alerts.length > 0 && (
        <div className="panel-section">
          <h3>Alertas</h3>
          {reservation.alerts.map((alert) => (
            <div className={`alert-line ${alert.severidad}`} key={alert.id}>{alert.mensaje}</div>
          ))}
        </div>
      )}

      <section className="panel-section reservation-payments-section">
        <h3><CreditCard size={21} />Pagos</h3>
        {reservation.payments.map((item) => (
          <div className="list-row reservation-payment-row" key={item.id}>
            <span className="reservation-payment-icon"><CircleDollarSign size={20} /></span>
            <div><strong>{formatMoney(item.monto)}</strong><small>{item.fecha_pago} · {item.banco_o_medio || item.metodo_pago}</small></div>
            <em>Registrado</em>
            <button className="icon" title="Eliminar pago" onClick={async () => { if (window.confirm("Eliminar este pago?")) { await api.deletePayment(item.id); refreshReservation(); } }}><X size={16} /></button>
          </div>
        ))}
        <div className="reservation-payment-form">
          <label>Monto<input placeholder="$ 0" value={payment.monto} onChange={(event) => setPayment({ ...payment, monto: event.target.value })} /></label>
          <label>Fecha<input type="date" value={payment.fecha_pago} onChange={(event) => setPayment({ ...payment, fecha_pago: event.target.value })} /></label>
          <label>Banco o medio<input placeholder="Seleccionar" value={payment.banco_o_medio} onChange={(event) => setPayment({ ...payment, banco_o_medio: event.target.value })} /></label>
          <button className="primary" disabled={busy || !payment.monto} onClick={addPaymentSubmit}><CreditCard size={17} />Registrar pago</button>
        </div>
        {reservation.saldo > 0 && <button className="reservation-mark-paid" disabled={busy} onClick={() => api.createPayment(reservation.id, { monto: reservation.saldo, fecha_pago: today, metodo_pago: reservation.metodo_pago, banco_o_medio: reservation.banco_o_medio_pago, nota: "Marcado como pagado" }).then(refreshReservation)}><Check size={16} />Marcar saldo como pagado</button>}
      </section>

      <section className="panel-section reservation-receipts-section">
        <h3><Paperclip size={21} />Comprobantes</h3>
        {reservation.attachments.map((item: Attachment) => (
          <div className="list-row reservation-attachment-row" key={item.id}>
            <a href={item.ruta_archivo} target="_blank" rel="noreferrer"><Paperclip size={15} />{item.nombre_archivo}</a>
            <button className="icon" title="Eliminar comprobante" onClick={async () => { if (window.confirm("Eliminar este comprobante?")) { await api.deleteAttachment(item.id); refreshReservation(); } }}><X size={16} /></button>
          </div>
        ))}
        <div className="reservation-receipt-dropzone">
          <Upload size={33} />
          <div><span>Arrastra archivos aquí o</span><label><Paperclip size={16} />Adjuntar<input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><small>PDF, JPG o PNG Â· Máx. 10 MB</small></div>
        </div>
        {file && <div className="reservation-receipt-upload"><input placeholder="Nota del comprobante" value={uploadNote} onChange={(event) => setUploadNote(event.target.value)} /><button className="primary" disabled={busy} onClick={uploadAttachment}><Upload size={16} />Guardar comprobante</button></div>}
      </section>

      <div className="panel-actions">
        <button onClick={props.onEdit}><FileText size={17} />Editar</button>
        <button onClick={() => updateStatus("reprogramada")}><CalendarDays size={17} />Reprogramar</button>
        <button onClick={() => updateStatus("finalizada")}><Check size={17} />Finalizar</button>
        <button className="danger" onClick={() => { if (window.confirm("Cancelar esta reserva?")) updateStatus("cancelada"); }}><X size={17} />Cancelar</button>
        <button className="danger" onClick={async () => { if (window.confirm("Eliminar reserva?")) { await api.deleteReservation(reservation.id); props.onClose(); props.onChanged(); } }}><Trash2 size={17} />Eliminar</button>
      </div>
    </aside>
  );
}

function ReservationModal(props: {
  rooms: Room[];
  reservation?: Reservation;
  prefill?: Record<string, unknown>;
  onNotify: (text: string, tone?: "success" | "error" | "") => void;
  onClose: () => void;
  onSaved: (reservation: Reservation) => void;
}) {
  const initialRooms = props.reservation?.rooms.map((room) => room.habitacion_id) || (props.prefill?.roomIds as number[] | undefined) || [];
  const [form, setForm] = useState<Record<string, any>>({ ...emptyReservation, ...(props.reservation || {}), ...(props.prefill || {}) });
  const [roomIds, setRoomIds] = useState<number[]>(initialRooms);
  const [manualTotal, setManualTotal] = useState(Boolean(props.reservation?.total_manual));
  const [roomQuery, setRoomQuery] = useState("");
  const [clientStatus, setClientStatus] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) props.onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [props.onClose, saving]);

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

  useEffect(() => {
    const cedula = String(form.cedula || "").trim();
    if (cedula.length < 3) {
      setClientStatus("");
      return;
    }

    let cancelled = false;
    setClientStatus("Buscando cliente...");
    api.clientByCedula(cedula)
      .then((client) => {
        if (cancelled) return;
        if (!client) {
          setClientStatus("Cliente nuevo.");
          return;
        }
        setClientStatus("Cliente encontrado y autocompletado.");
        setForm((current) => {
          if (String(current.cedula || "").trim() !== cedula) return current;
          const guestName = `${client.primer_nombre || ""} ${client.segundo_nombre || ""}`.trim();
          const guestLastName = `${client.primer_apellido || ""} ${client.segundo_apellido || ""}`.trim();
          return {
            ...current,
            nombre_completo_huesped: client.nombre_completo || current.nombre_completo_huesped,
            nombre_huesped: guestName || current.nombre_huesped,
            apellido_huesped: guestLastName || current.apellido_huesped,
            correo: client.correo || current.correo,
            telefono: client.telefono || current.telefono,
            direccion: client.direccion || current.direccion
          };
        });
      })
      .catch((err) => {
        if (!cancelled) setClientStatus(err instanceof Error ? err.message : "No se pudo buscar el cliente.");
      });

    return () => {
      cancelled = true;
    };
  }, [form.cedula]);

  const updateStay = (key: "fecha_ingreso" | "fecha_salida" | "noches", value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      const start = String(key === "fecha_ingreso" ? value : current.fecha_ingreso || "");
      const end = String(key === "fecha_salida" ? value : current.fecha_salida || "");
      const nights = Number(key === "noches" ? value : current.noches || 0);

      if ((key === "noches" || key === "fecha_ingreso") && start && Number.isFinite(nights)) {
        next.fecha_salida = addDays(start, Math.max(0, nights));
      }
      if (key === "fecha_salida" && start && end) {
        next.noches = String(Math.max(0, diffDays(start, end)));
      }
      return next;
    });
  };

  const addPendingFiles = (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    if (!accepted.length) {
      props.onNotify("Solo se aceptan imagenes o PDF.", "error");
      return;
    }
    setPendingFiles((current) => [...current, ...accepted]);
  };

  const uploadPendingFiles = async (reservationId: number) => {
    if (!pendingFiles.length) return;
    let uploaded = 0;
    for (const file of pendingFiles) {
      const formData = new FormData();
      formData.append("file", renameReceiptFile(file, String(form.nombre_completo_huesped || "huesped")));
      formData.append("nota", "Comprobante adjuntado al crear la reserva");
      await api.uploadAttachment(reservationId, formData);
      uploaded += 1;
    }
    props.onNotify(`${uploaded} comprobante${uploaded === 1 ? "" : "s"} subido${uploaded === 1 ? "" : "s"}.`, "success");
  };

  const submit = async () => {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const body = { ...form, roomIds, total_manual: manualTotal };
      const saved = props.reservation
        ? await api.updateReservation(props.reservation.id, body)
        : await api.createReservation(body);
      try {
        await uploadPendingFiles(saved.id);
      } catch (err) {
        props.onNotify(err instanceof Error ? err.message : "La reserva se guardo, pero fallo el comprobante.", "error");
      }
      const fresh = await api.reservation(saved.id).catch(() => saved);
      props.onSaved(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const selectedRooms = props.rooms.filter((room) => roomIds.includes(room.id));
  const filteredRooms = props.rooms.filter((room) => {
    const query = roomQuery.trim().toLowerCase();
    return !query || room.codigo_habitacion.toLowerCase().includes(query) || room.nombre_habitacion.toLowerCase().includes(query);
  });
  const selectedRoomLabel = selectedRooms.length ? selectedRooms.map((room) => room.codigo_habitacion).join(" + ") : "Sin habitacion";
  const isEditing = Boolean(props.reservation);

  return (
    <div className="modal-backdrop">
      <section className="modal wide-modal reservation-modal reservation-create-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-modal-title">
        <div className="modal-header reservation-modal-hero">
          <span className="hero-icon"><BedDouble size={28} /></span>
          <button className="icon reservation-mobile-back" type="button" title="Volver" aria-label="Volver" onClick={props.onClose}><ChevronLeft size={24} /></button>
          <div>
            <strong id="reservation-modal-title">{isEditing ? `Detalles de reserva: ${reservationCode(props.reservation!)}` : "Nueva reserva"}</strong>
            <span>{isEditing ? "Actualiza los datos principales de la reserva" : "Crea y registra una nueva reserva de hotel"}</span>
          </div>
          <button className="icon" type="button" title="Cerrar formulario" aria-label="Cerrar formulario de reserva" onClick={props.onClose}><X size={20} /></button>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}

        <div className="reservation-modal-summary">
          <div className="summary-tile room">
            <BedDouble size={24} />
            <span>Habitacion</span>
            <strong>{selectedRoomLabel}</strong>
          </div>
          <div className="summary-tile money">
            <Wallet size={24} />
            <span>Total</span>
            <strong>{formatMoney(Number(form.total_pago || 0))}</strong>
          </div>
          <div className="summary-tile status">
            <BadgeCheck size={24} />
            <span>Estado inicial</span>
            <strong>Confirmada</strong>
          </div>
        </div>

        <div className="reservation-modal-layout">
          <section className="reservation-form-card room-select-field">
            <h3><BedDouble size={18} />Seleccionar habitacion</h3>
            <input aria-label="Buscar habitación" value={roomQuery} onChange={(event) => setRoomQuery(event.target.value)} placeholder="Buscar habitacion..." />
            <div className="room-picker">
              {filteredRooms.map((room) => (
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
            <div className="room-legend"><span><i className="available" />Disponible</span><span><i className="occupied" />Ocupada</span><span><i className="cleaning" />Limpieza</span></div>
          </section>

          <section className="reservation-form-card">
            <h3><User size={18} />Informacion del huesped</h3>
            <div className="form-grid two">
              <Field label="Cedula / ID" value={String(form.cedula || "")} onChange={(value) => update("cedula", value)} required />
              <Field label="Nombre completo" value={String(form.nombre_completo_huesped || "")} onChange={(value) => update("nombre_completo_huesped", value)} required />
              <Field label="Nombre" value={String(form.nombre_huesped || "")} onChange={(value) => update("nombre_huesped", value)} />
              <Field label="Apellido" value={String(form.apellido_huesped || "")} onChange={(value) => update("apellido_huesped", value)} />
              <Field label="Telefono" value={String(form.telefono || "")} onChange={(value) => update("telefono", value)} />
              <Field label="Correo electronico" value={String(form.correo || "")} onChange={(value) => update("correo", value)} />
              <label className="full">Direccion
                <input value={String(form.direccion || "")} onChange={(event) => update("direccion", event.target.value)} />
              </label>
            </div>
            {clientStatus && <small className="form-note">{clientStatus}</small>}
          </section>

          <section className="reservation-form-card">
            <h3><CalendarDays size={18} />Detalles de la estadia</h3>
            <div className="form-grid two">
              <Field label="Huespedes" type="number" value={String(form.cantidad_huespedes || "")} onChange={(value) => update("cantidad_huespedes", value)} />
              <label>Tipo de estadia
                <select value={String(form.tipo_estadia || "noche")} onChange={(event) => update("tipo_estadia", event.target.value)}>
                  <option value="noche">Noche</option>
                  <option value="day_use">Day use</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <Field label="Fecha de ingreso" type="date" value={String(form.fecha_ingreso || "")} onChange={(value) => updateStay("fecha_ingreso", value)} />
              <Field label="Noches" type="number" value={String(form.noches || "0")} onChange={(value) => updateStay("noches", value)} />
              <Field label="Fecha de salida" type="date" value={String(form.fecha_salida || "")} onChange={(value) => updateStay("fecha_salida", value)} />
            </div>
          </section>

          <section className="reservation-form-card">
            <h3><CircleDollarSign size={18} />Facturacion y pagos</h3>
            <div className="form-grid two">
              <Field label="Valor base" type="number" value={String(form.valor_base || "0")} onChange={(value) => update("valor_base", value)} />
              <label>Total
                <input type="number" value={String(form.total_pago || "0")} onChange={(event) => { setManualTotal(true); update("total_pago", event.target.value); }} />
              </label>
              <Field label="Abono inicial" type="number" value={String(form.abono || "0")} onChange={(value) => update("abono", value)} />
              <Field label="Saldo" type="number" value={String(form.saldo || "0")} onChange={(value) => update("saldo", value)} />
              <Field label="Fecha abono" type="date" value={String(form.fecha_abono || "")} onChange={(value) => update("fecha_abono", value)} />
              <label>Metodo pago
                <select value={String(form.metodo_pago || "transferencia")} onChange={(event) => update("metodo_pago", event.target.value)}>
                  {["transferencia", "efectivo", "tarjeta", "link_pago", "nequi", "davivienda", "bancolombia", "bold", "otro"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="reservation-form-card">
            <h3><FileText size={18} />Control interno</h3>
            <div className="form-grid two">
              <label>Canal
                <select value={String(form.origen_reserva || "whatsapp")} onChange={(event) => update("origen_reserva", event.target.value)}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="airbnb">Airbnb</option>
                </select>
              </label>
              <span className="internal-id-preview"><Hash size={15} />ID interno: {isEditing ? props.reservation?.id : "se asigna al guardar"}</span>
              <label className="check"><input type="checkbox" checked={Boolean(form.airbnb_ok)} onChange={(event) => update("airbnb_ok", event.target.checked)} />AIRBNB OK</label>
              <label className="check"><input type="checkbox" checked={Boolean(form.whatsapp_ok)} onChange={(event) => update("whatsapp_ok", event.target.checked)} />WhatsApp OK</label>
              <label className="check"><input type="checkbox" checked={Boolean(form.siigo_ok)} onChange={(event) => update("siigo_ok", event.target.checked)} />SIIGO OK</label>
              <label className="check"><input type="checkbox" checked={Boolean(form.queo_ok)} onChange={(event) => update("queo_ok", event.target.checked)} />QUEO OK</label>
            </div>
          </section>

          <section className="reservation-form-card">
            <h3><ImagePlus size={18} />Comprobante</h3>
            <div
              className={`receipt-dropzone ${dragOver ? "dragging" : ""}`}
              tabIndex={0}
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                addPendingFiles(Array.from(event.dataTransfer.files || []));
              }}
              onPaste={(event) => addPendingFiles(Array.from(event.clipboardData.files || []))}
            >
              <Paperclip size={20} />
              <strong>Adjuntar comprobante</strong>
              <span>Selecciona archivo, arrastra aqui o pega una imagen con Ctrl+V</span>
              <input type="file" accept="image/*,application/pdf" multiple onChange={(event) => addPendingFiles(Array.from(event.target.files || []))} />
            </div>
            {pendingFiles.length > 0 && (
              <div className="pending-files">
                {pendingFiles.map((file, index) => (
                  <button type="button" key={`${file.name}-${index}`} onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    {file.name}<X size={14} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="reservation-form-card">
            <h3><FileText size={18} />Observaciones</h3>
            <textarea value={String(form.observaciones || "")} onChange={(event) => update("observaciones", event.target.value)} placeholder="Agregar observaciones..." />
          </section>
        </div>
        <div className="modal-actions">
          <button onClick={() => setManualTotal(false)}><RotateCcw size={16} />Recalcular total</button>
          <button onClick={props.onClose}>Cerrar</button>
          <button className="primary" disabled={saving} onClick={submit}><Save size={17} />{saving ? "Guardando reserva..." : "Guardar reserva"}</button>
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="block-modal-title">
        <div className="modal-header"><strong id="block-modal-title">Bloquear habitaciones</strong><button className="icon" type="button" aria-label="Cerrar bloqueo de habitaciones" title="Cerrar bloqueo de habitaciones" onClick={props.onClose}><X size={20} /></button></div>
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="block-detail-title">
        <div className="modal-header">
          <div>
            <strong id="block-detail-title">Detalle de bloqueo</strong>
            <span>{props.block.codigo_habitacion || props.block.habitacion_id} · {props.block.origen_bloqueo || "manual"}</span>
          </div>
          <button className="icon" type="button" aria-label="Cerrar detalle de bloqueo" title="Cerrar detalle de bloqueo" onClick={props.onClose}><X size={20} /></button>
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
    <aside className="availability-panel" role="dialog" aria-modal="true" aria-labelledby="availability-panel-title">
      <div className="panel-header">
        <div><strong id="availability-panel-title">Buscar disponibilidad</strong><small>Fechas, huespedes y tipo opcional</small></div>
        <button className="icon" type="button" aria-label="Cerrar búsqueda de disponibilidad" title="Cerrar búsqueda de disponibilidad" onClick={props.onClose}><X size={20} /></button>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="mini-form">
        <input aria-label="Fecha de ingreso" type="date" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} />
        <input aria-label="Fecha de salida" type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} />
        <input aria-label="Cantidad de huéspedes" type="number" min="1" inputMode="numeric" value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} />
        <input aria-label="Tipo de habitación" placeholder="Tipo" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} />
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

function formatDisplayDate(value: string) {
  const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const parsed = parseDate(value);
  const day = parsed.getUTCDate();
  return `${weekdays[parsed.getUTCDay()]}, ${String(day).padStart(2, "0")} de ${months[parsed.getUTCMonth()]} de ${parsed.getUTCFullYear()}`;
}

function averageStay(rows: OperationRow[]) {
  if (!rows.length) return "0";
  const total = rows.reduce((sum, row) => sum + Math.max(1, diffDays(row.ingreso, row.salida)), 0);
  return (total / rows.length).toLocaleString("es-CO", { maximumFractionDigits: 1 });
}

function uniqueRooms(rows: OperationRow[]) {
  return new Set(rows.map((row) => row.habitacion_id || row.habitacion)).size;
}

function TodayView(props: { onSelect: (reservation: Reservation) => void; onNew: () => void }) {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<TodayOperations | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const monthStart = `${date.slice(0, 7)}-01`;
      const [todayData, dashboardData] = await Promise.all([
        api.today({ date }),
        api.dashboard({ start: monthStart, end: `${shiftMonth(date.slice(0, 7), 1)}-01` })
      ]);
      setData(todayData);
      setDashboard(dashboardData);
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
      <section className="today-hero">
        <div>
          <span>Operacion diaria</span>
          <h1>Hoy <span aria-hidden="true">👋</span></h1>
          <p>{formatDisplayDate(date)}</p>
        </div>
        <div className="today-actions">
          <label><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button className="primary" onClick={props.onNew}><Plus size={18} />Nueva reserva</button>
        </div>
      </section>
      {loading && <div className="notice">Cargando operacion...</div>}
      {error && <div className="notice error">{error}</div>}
      {!data ? (
        <div className="empty-state">Sin datos para mostrar.</div>
      ) : (
        <>
          <MobileTodayHome
            date={date}
            data={data}
            available={dashboard?.habitaciones_disponibles_hoy ?? 0}
            onNew={props.onNew}
            onOpen={openReservation}
          />
          <div className="today-desktop-content">
          <section className="today-kpi-grid">
            <TodayKpi icon={<CalendarDays size={25} />} value={data.checkins_today.length} label="Reservas hoy" delta="↑ datos reales" tone="green" />
            <TodayKpi icon={<BedDouble size={25} />} value={uniqueRooms(data.in_house)} label="Ocupadas hoy" delta="↑ operacion actual" tone="blue" />
            <TodayKpi icon={<Building2 size={25} />} value={dashboard?.habitaciones_disponibles_hoy ?? 0} label="Disponibles hoy" delta="— Sin cambios" tone="mint" />
            <TodayKpi icon={<Check size={25} />} value={dashboard?.habitaciones_bloqueadas ?? 0} label="Bloqueadas hoy" delta="— Sin cambios" tone="orange" />
            <TodayKpi icon={<LayoutDashboard size={25} />} value={`${Math.round(Number(dashboard?.ocupacion_promedio || 0))}%`} label="Ocupacion hoy" delta="↑ segun periodo" tone="purple" />
          </section>

          <section className="today-board">
            <div className="today-left">
              <section className="today-card today-summary-card">
                <div className="today-card-title">
                  <div><LayoutDashboard size={18} /><strong>Resumen del dia</strong><span>Panorama general de tu operacion</span></div>
                </div>
                <div className="today-summary-strip">
                  <TodayMiniStat icon={<Users size={22} />} value={data.in_house.length} label="Huespedes actuales" />
                  <TodayMiniStat icon={<Building2 size={22} />} value={data.checkins_today.length} label="Llegadas programadas" />
                  <TodayMiniStat icon={<CreditCard size={22} />} value={data.checkouts_today.length} label="Salidas programadas" />
                  <TodayMiniStat icon={<BedDouble size={22} />} value={data.in_house.length} label="Estancias activas" />
                </div>
                <div className="today-summary-row">
                  <TodayMiniStat icon={<CalendarDays size={22} />} value={averageStay(data.in_house)} label="Estadia promedio" suffix="noches" />
                  <TodayMiniStat icon={<CircleDollarSign size={22} />} value={formatMoney(dashboard?.ingresos_estimados_mes || 0)} label="Ingreso estimado del mes" suffix="COP" />
                </div>
                <div className="today-month-progress">
                  <div><strong>Ocupacion del mes</strong><b>{Math.round(Number(dashboard?.ocupacion_promedio || 0))}%</b></div>
                  <span><i style={{ width: `${Math.min(100, Math.max(0, Number(dashboard?.ocupacion_promedio || 0)))}%` }} /></span>
                </div>
              </section>

              <section className="today-card today-clean-card">
                <div><Check size={19} /><strong>Aseos pendientes y segundo dia</strong></div>
                {[...data.checkouts_today, ...data.second_day_cleaning].length === 0 ? (
                  <p><span>Sin registros para hoy</span><small>Buen trabajo, todo al dia ✨</small></p>
                ) : (
                  <div className="today-clean-list">
                    {[...data.checkouts_today.map((row) => ({ ...row, cleanType: "Aseo pendiente" })), ...data.second_day_cleaning.map((row) => ({ ...row, cleanType: "Segundo dia" }))].slice(0, 6).map((row) => (
                      <button key={`${row.cleanType}-${row.id}`} onClick={() => openReservation(row)}>
                        <strong>Hab. {row.habitacion} - {row.huesped}</strong>
                        <small>{row.cleanType}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="today-right">
              <TodayList title="Hospedados" rows={data.in_house} onSelect={openReservation} featured />
              <TodayList title="Salen hoy" rows={data.checkouts_today} onSelect={openReservation} featured />
              <TodayList title="Ingresan manana" rows={data.checkins_tomorrow} onSelect={openReservation} featured />
              {data.urgent_turnovers.length > 0 && <TodayList title="Urgentes" rows={data.urgent_turnovers} onSelect={openReservation} featured />}
            </div>
          </section>
          </div>
        </>
      )}
    </section>
  );
}

function MobileTodayHome(props: {
  date: string;
  data: TodayOperations;
  available: number;
  onNew: () => void;
  onOpen: (row: OperationRow) => void;
}) {
  const [pendingDetail, setPendingDetail] = useState(false);
  const [quickDetail, setQuickDetail] = useState<"guests" | "departures" | "urgent" | null>(null);
  const allPendingRows = [
    ...props.data.checkouts_today.slice(0, 1).map((row) => ({ row, label: "Aseo pendiente", tone: "clean" })),
    ...props.data.second_day_cleaning.slice(0, 1).map((row) => ({ row, label: "2° día", tone: "second-day" })),
    ...props.data.checkouts_today.slice(1).map((row) => ({ row, label: "Aseo pendiente", tone: "clean" })),
    ...props.data.second_day_cleaning.slice(1).map((row) => ({ row, label: "2° día", tone: "second-day" }))
  ];
  const pendingRows = allPendingRows.slice(0, 2);
  const quickAccess = [
    { label: "Hospedados", amount: `${props.data.in_house.length} huéspedes`, icon: <Users size={27} />, tone: "guests" as const, rows: props.data.in_house },
    { label: "Salen hoy", amount: `${props.data.checkouts_today.length} reservas`, icon: <CalendarDays size={27} />, tone: "departures" as const, rows: props.data.checkouts_today },
    { label: "Urgentes", amount: `${props.data.urgent_turnovers.length} alertas`, icon: <AlertCircle size={27} />, tone: "urgent" as const, rows: props.data.urgent_turnovers }
  ];

  return (
    <section className="mobile-today-reference">
      <header className="mobile-today-heading">
        <h1>Hoy</h1>
        <p>{formatDisplayDate(props.date)}</p>
      </header>
      <button className="mobile-today-new primary" onClick={props.onNew}><Plus size={30} />Nueva reserva</button>
      <section className="mobile-today-kpis">
        <MobileTodayMetric icon={<CalendarDays size={29} />} value={props.data.checkins_today.length} label="Reservas hoy" tone="green" />
        <MobileTodayMetric icon={<BedDouble size={29} />} value={uniqueRooms(props.data.in_house)} label="Ocupadas hoy" tone="blue" />
        <MobileTodayMetric icon={<Building2 size={29} />} value={props.available} label="Disponibles hoy" tone="green" />
      </section>
      <section className="mobile-today-panel pending-today-panel">
        <header>
          <h2>Pendientes de hoy</h2>
          {allPendingRows.length > 0 && <button type="button" onClick={() => setPendingDetail(true)}>Ver todo <ChevronRight size={20} /></button>}
        </header>
        <div>
          {pendingRows.map(({ row, label, tone }) => (
            <button className={`mobile-pending-row ${tone}`} key={`${label}-${row.id}`} onClick={() => props.onOpen(row)}>
              <span>{tone === "clean" ? <Check size={28} /> : <CalendarDays size={27} />}</span>
              <strong>Hab. {row.habitacion} <em>· {row.huesped}</em><i>{label}</i></strong>
              <ChevronRight size={25} />
            </button>
          ))}
          {pendingRows.length === 0 && <p className="empty-copy">No hay pendientes para hoy.</p>}
        </div>
      </section>
      <section className="mobile-today-panel quick-access-panel">
        <h2>Accesos rápidos</h2>
        <div className="mobile-quick-grid">
          {quickAccess.map((item) => (
            <button className={item.tone} key={item.label} onClick={() => setQuickDetail(item.tone)}>
              <span>{item.icon}</span><ChevronRight size={21} /><strong>{item.label}</strong><i>{item.amount}</i>
            </button>
          ))}
        </div>
      </section>
      {quickDetail && <MobileQuickAccessPanel type={quickDetail} rows={quickAccess.find((item) => item.tone === quickDetail)?.rows || []} onClose={() => setQuickDetail(null)} onOpen={props.onOpen} />}
      {pendingDetail && <MobileQuickAccessPanel type="pending" rows={allPendingRows.map((item) => item.row)} onClose={() => setPendingDetail(false)} onOpen={props.onOpen} />}
    </section>
  );
}

function MobileTodayMetric(props: { icon: ReactNode; value: string | number; label: string; tone: string }) {
  return <article className={props.tone}><span>{props.icon}</span><strong>{props.value}</strong><small>{props.label}</small></article>;
}

function MobileQuickAccessPanel(props: {
  type: "guests" | "departures" | "urgent" | "pending";
  rows: OperationRow[];
  onClose: () => void;
  onOpen: (row: OperationRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<"todos" | "airbnb" | "whatsapp">("todos");
  const config = {
    guests: { title: "Hospedados", subtitle: `${props.rows.length} huéspedes actualmente alojados`, icon: <Users size={29} /> },
    departures: { title: "Salen hoy", subtitle: `${props.rows.length} reservas con salida programada`, icon: <CalendarDays size={29} /> },
    urgent: { title: "Urgentes", subtitle: `${props.rows.length} alertas que requieren atención`, icon: <AlertCircle size={29} /> },
    pending: { title: "Pendientes de hoy", subtitle: `${props.rows.length} tareas pendientes para hoy`, icon: <Check size={29} /> }
  }[props.type];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = props.rows.filter((row) => {
    const matchesQuery = !normalizedQuery || `${row.huesped} ${row.habitacion}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (channel === "todos" || String(row.canal || "").toLowerCase() === channel);
  });
  const airbnbCount = props.rows.filter((row) => String(row.canal || "").toLowerCase() === "airbnb").length;
  const whatsappCount = props.rows.filter((row) => String(row.canal || "").toLowerCase() === "whatsapp").length;
  const shortDate = (value: string) => value ? new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parseDate(value)).replace(".", "") : "Sin fecha";

  return (
    <aside className="mobile-quick-detail" role="dialog" aria-modal="true" aria-labelledby="quick-access-title">
      <header className="mobile-quick-detail-top">
        <button className="icon" type="button" aria-label="Volver a Hoy" onClick={props.onClose}><ChevronLeft size={28} /></button>
        <div className="mobile-detail-brand"><img src="/logos/vista-montana-instagram.png" alt="Vista Montaña" /><span>Vista Montaña<small>Apartasuites</small></span></div>
      </header>
      <section className="mobile-quick-detail-content">
        <div className={`mobile-quick-detail-heading ${props.type}`}><span>{config.icon}</span><div><h1 id="quick-access-title">{config.title}</h1><p>{config.subtitle}</p></div></div>
        <label className="mobile-quick-search"><Search size={25} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar huésped o habitación" /></label>
        <div className="mobile-quick-filters">
          {(["todos", "airbnb", "whatsapp"] as const).map((value) => <button key={value} className={channel === value ? "active" : ""} onClick={() => setChannel(value)}>{value === "todos" ? "Todos" : channelLabel(value)}</button>)}
        </div>
        <section className="mobile-quick-summary">
          <span>{config.icon}</span><div><small>Total {config.title.toLowerCase()}</small><strong>{props.rows.length}</strong></div><div><small>Airbnb</small><strong>{airbnbCount}</strong></div><div><small>WhatsApp</small><strong>{whatsappCount}</strong></div>
        </section>
        <div className="mobile-quick-list">
          {filteredRows.map((row) => {
            const isAirbnb = String(row.canal || "").toLowerCase() === "airbnb";
            const initials = String(row.huesped || "VM").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            return <button key={row.id} className="mobile-guest-row" onClick={() => props.onOpen(row)}>
              <span className="mobile-guest-initials">{initials || "VM"}</span>
              <span className="mobile-guest-main"><strong>{row.huesped || "Huésped sin nombre"}</strong><em>Hab. {row.habitacion || "Sin asignar"}</em><small><i>Check-in</i>{shortDate(row.ingreso)} <i>Check-out</i>{shortDate(row.salida)} <i>Noches</i>{Math.max(1, diffDays(row.ingreso, row.salida))}</small></span>
              <span className={`mobile-guest-channel ${isAirbnb ? "airbnb" : "whatsapp"}`}>{channelLabel(row.canal)}<i>{props.type === "departures" ? "Salida hoy" : props.type === "urgent" ? "Urgente" : props.type === "pending" ? "Pendiente" : "Alojado"}</i></span><ChevronRight size={25} />
            </button>;
          })}
          {filteredRows.length === 0 && <p className="empty-copy">No hay resultados para este filtro.</p>}
        </div>
      </section>
    </aside>
  );
}

function TodayKpi(props: { icon: ReactNode; value: string | number; label: string; delta: string; tone: string }) {
  return (
    <article className={`today-kpi ${props.tone}`}>
      <span>{props.icon}</span>
      <div><strong>{props.value}</strong><small>{props.label}</small><em>{props.delta}</em></div>
    </article>
  );
}

function TodayMiniStat(props: { icon: ReactNode; value: string | number; label: string; suffix?: string }) {
  return (
    <div className="today-mini-stat">
      <span>{props.icon}</span>
      <strong>{props.value}</strong>
      <small>{props.label}</small>
      {props.suffix && <em>{props.suffix}</em>}
    </div>
  );
}

function channelLabel(channel: string) {
  return String(channel || "").toLowerCase() === "airbnb" ? "Airbnb" : "WhatsApp";
}

function TodayList(props: { title: string; rows: OperationRow[]; onSelect: (row: OperationRow) => void; compact?: boolean; featured?: boolean }) {
  return (
    <section className={`today-card today-list-card ${props.compact ? "compact" : ""} ${props.featured ? "featured" : ""}`}>
      <div className="today-list-title">
        <strong>{props.title}</strong>
        <small>{props.rows.length} {props.rows.length === 1 ? "reserva" : "reservas"}</small>
      </div>
      {props.rows.length === 0 && <p className="empty-copy">Sin registros.</p>}
      {props.rows.slice(0, props.featured ? 4 : 2).map((row) => (
        <button className="today-reservation-row" key={row.id} onClick={() => props.onSelect(row)}>
          <span className="today-avatar">{String(row.huesped || "VM").slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>Hab. {row.habitacion} - {row.huesped}</strong>
            <small>{row.telefono || "Sin telefono"} · {channelLabel(row.canal)} · {row.ingreso.slice(5)} - {row.salida.slice(5)}</small>
          </div>
          <i className={`vm-badge ${String(row.canal).toLowerCase() === "airbnb" ? "airbnb" : "whatsapp"}`}>{channelLabel(row.canal)}</i>
          {!props.compact && <b>›</b>}
        </button>
      ))}
      {props.rows.length > (props.featured ? 4 : 2) && <button className="today-view-all">Ver todas ({props.rows.length}) <ChevronRight size={15} /></button>}
    </section>
  );
}

type CleaningFilter = "todas" | "por_limpiar" | "limpiando" | "salida_hoy" | "salida_manana" | "segundo_dia" | "limpio";
type OperationalCleaningTask = { room: CleaningRoom; date: string; dayLabel: string };

function needsCleaning(room: CleaningRoom) {
  return (room.estado === "sin limpiar" || room.estado === "por limpiar") ||
    (room.prioridad === "urgente" && room.estado !== "limpiando" && room.estado !== "limpio");
}

function formatCleaningState(state: CleaningRoom["estado"]) {
  return state.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleaningInitial(room: CleaningRoom) {
  return room.codigo_habitacion.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "VM";
}

function cleaningTone(state: CleaningRoom["estado"]) {
  if (state === "limpio") return "clean";
  if (state === "limpiando") return "working";
  return "pending";
}

function cleaningRoomOperation(room: CleaningRoom, rows: OperationRow[]) {
  return rows.find((row) => row.habitacion_id === room.habitacion_id);
}

function operationRoomIds(rows: OperationRow[]) {
  return new Set(rows.map((row) => row.habitacion_id));
}

function CleaningView(props: { onNavigate: (view: View) => void; onMenuChange: (open: boolean) => void }) {
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<CleaningReport | null>(null);
  const [reportTomorrow, setReportTomorrow] = useState<CleaningReport | null>(null);
  const [opsToday, setOpsToday] = useState<TodayOperations | null>(null);
  const [opsTomorrow, setOpsTomorrow] = useState<TodayOperations | null>(null);
  const [filter, setFilter] = useState<CleaningFilter>("todas");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const nextDate = addDays(date, 1);
      const [current, todayOps, tomorrowOps, tomorrowCleaning] = await Promise.all([
        api.cleaning({ date }),
        api.today({ date }),
        api.today({ date: nextDate }),
        api.cleaning({ date: nextDate })
      ]);
      setReport(current);
      setReportTomorrow(tomorrowCleaning);
      setOpsToday(todayOps);
      setOpsTomorrow(tomorrowOps);
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

  const updateRoom = async (room: CleaningReport["rooms"][number], estado = room.estado, targetDate = date) => {
    setMessage("");
    setError("");
    try {
      await api.updateCleaning(room.habitacion_id, {
        fecha: targetDate,
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

  const tomorrowDate = addDays(date, 1);
  const checkoutTodayIds = operationRoomIds(opsToday?.checkouts_today || []);
  const checkoutTomorrowIds = operationRoomIds(opsTomorrow?.checkouts_today || []);
  const secondTomorrowIds = operationRoomIds(opsTomorrow?.second_day_cleaning || []);
  const query = search.trim().toLowerCase();
  const rooms = report?.rooms || [];
  const tomorrowRoomById = new Map((reportTomorrow?.rooms || []).map((room) => [room.habitacion_id, room]));
  const roomsTomorrow = rooms.map((room) => tomorrowRoomById.get(room.habitacion_id) || room);
  const filteredRooms = rooms.filter((room) => {
    if (query && ![room.codigo_habitacion, room.nombre_habitacion, room.estado, room.prioridad].join(" ").toLowerCase().includes(query)) return false;
    if (filter === "por_limpiar") return needsCleaning(room);
    if (filter === "salida_hoy") return checkoutTodayIds.has(room.habitacion_id);
    if (filter === "salida_manana") return checkoutTomorrowIds.has(room.habitacion_id);
    if (filter === "segundo_dia") return secondTomorrowIds.has(room.habitacion_id);
    if (filter === "limpio") return room.estado === "limpio" && room.prioridad !== "urgente";
    return true;
  });
  const pendingRooms = rooms.filter(needsCleaning);
  const cleanRooms = rooms.filter((room) => room.estado === "limpio" && room.prioridad !== "urgente");
  const workingRooms = rooms.filter((room) => room.estado === "limpiando");
  const progressTotal = Math.max(1, rooms.length);
  const progress = Math.round((cleanRooms.length / progressTotal) * 100);
  const checkoutTodayRooms = rooms.filter((room) => checkoutTodayIds.has(room.habitacion_id));
  const checkoutTomorrowRooms = roomsTomorrow.filter((room) => checkoutTomorrowIds.has(room.habitacion_id));
  const secondTomorrowRooms = roomsTomorrow.filter((room) => secondTomorrowIds.has(room.habitacion_id));
  const quickRows = [...workingRooms, ...pendingRooms].slice(0, 4);
  const tomorrowOperationalIds = new Set([...checkoutTomorrowIds, ...secondTomorrowIds]);
  const operationalPendingRooms: OperationalCleaningTask[] = [
    ...rooms
      .filter((room) => room.estado === "sin limpiar" || room.estado === "por limpiar")
      .map((room) => ({ room, date, dayLabel: "Hoy" })),
    ...roomsTomorrow
      .filter((room) => tomorrowOperationalIds.has(room.habitacion_id) && (room.estado === "sin limpiar" || room.estado === "por limpiar"))
      .map((room) => ({ room, date: tomorrowDate, dayLabel: "Mañana" }))
  ];
  const operationalWorkingRooms: OperationalCleaningTask[] = [
    ...rooms
      .filter((room) => room.estado === "limpiando")
      .map((room) => ({ room, date, dayLabel: "Hoy" })),
    ...roomsTomorrow
      .filter((room) => tomorrowOperationalIds.has(room.habitacion_id) && room.estado === "limpiando")
      .map((room) => ({ room, date: tomorrowDate, dayLabel: "Mañana" }))
  ];

  const saveState = async (room: CleaningRoom, estado: CleaningReport["rooms"][number]["estado"], targetDate = date) => updateRoom(room, estado, targetDate);

  return (
    <section className="cleaning-page">
      <DesktopCleaningWorkspace
        date={date}
        setDate={setDate}
        rooms={rooms}
        operations={[...(opsToday?.checkouts_today || []), ...(opsToday?.second_day_cleaning || []), ...(opsTomorrow?.checkouts_today || [])]}
        pendingCount={pendingRooms.length}
        workingCount={workingRooms.length}
        checkoutCount={checkoutTodayRooms.length}
        cleanCount={cleanRooms.length}
        filter={filter}
        setFilter={setFilter}
        onState={saveState}
        onRefresh={load}
        onNavigate={props.onNavigate}
      />
      <MobileCleaningHomeReference
        date={date}
        setDate={setDate}
        rooms={rooms}
        checkoutRows={opsToday?.checkouts_today || []}
        tomorrowRows={opsTomorrow?.checkouts_today || []}
        secondDayRows={opsToday?.second_day_cleaning || []}
        cleanCount={cleanRooms.length}
        pendingCount={pendingRooms.length}
        workingCount={workingRooms.length}
        checkoutCount={checkoutTodayRooms.length}
        filter={filter}
        setFilter={setFilter}
        onRefresh={load}
        onMenuChange={props.onMenuChange}
      />
      <section className="cleaning-hero">
        <div>
          <span>Control operativo</span>
          <h1>Limpieza</h1>
          <p>{formatDisplayDate(date)}</p>
        </div>
        <div className="cleaning-hero-actions">
          <label><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button className="primary" onClick={load}><RefreshCw size={16} />Actualizar</button>
        </div>
      </section>
      {loading && <div className="notice">Cargando limpieza...</div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="cleaning-kpi-grid">
        <CleaningKpi icon={<Check size={25} />} label="Por limpiar hoy" value={pendingRooms.length} delta="+ datos reales" tone="green" />
        <CleaningKpi icon={<Upload size={25} />} label="Salen hoy" value={opsToday?.checkouts_today.length || 0} delta="salidas programadas" tone="red" />
        <CleaningKpi icon={<CalendarDays size={25} />} label="Salen manana" value={opsTomorrow?.checkouts_today.length || 0} delta="siguiente dia" tone="orange" />
        <CleaningKpi icon={<RotateCcw size={25} />} label="2° dia manana" value={opsTomorrow?.second_day_cleaning.length || 0} delta="aseos preventivos" tone="purple" />
        <CleaningKpi icon={<BadgeCheck size={25} />} label="Habitaciones listas" value={cleanRooms.length} delta="listas para venta" tone="mint" />
      </section>

      <section className="cleaning-layout">
        <main className="cleaning-main-card">
          <div className="cleaning-main-header">
            <div><LayoutDashboard size={18} /><strong>Prioridad operativa</strong></div>
            <div className="cleaning-tools">
              <select value={filter} onChange={(event) => setFilter(event.target.value as CleaningFilter)}>
                <option value="todas">Todas</option>
                <option value="por_limpiar">Por limpiar</option>
                <option value="salida_hoy">Salida hoy</option>
                <option value="salida_manana">Salida manana</option>
                <option value="segundo_dia">2° dia</option>
                <option value="limpio">Limpio</option>
              </select>
            </div>
          </div>
          <div className="cleaning-tabs" aria-label="Filtro de habitaciones de limpieza">
            {([
              ["todas", "Todas"],
              ["por_limpiar", "Por limpiar"],
              ["salida_hoy", "Salida hoy"],
              ["salida_manana", "Salida manana"],
              ["segundo_dia", "2° dia"],
              ["limpio", "Limpio"]
            ] as [CleaningFilter, string][]).map(([value, label]) => (
              <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
            ))}
          </div>

          <section className="cleaning-operational-section">
            <div className="cleaning-section-title">
              <div><strong>Operativo</strong><small>Seguimiento en tiempo real de las habitaciones solicitadas para limpieza</small></div>
              <span>{operationalPendingRooms.length + operationalWorkingRooms.length} habitaciones</span>
            </div>
            <div className="cleaning-operational-grid">
              <CleaningOperationalColumn
                title="Por limpiar"
                tone="pending"
                tasks={operationalPendingRooms}
                onState={saveState}
              />
              <CleaningOperationalColumn
                title="En limpieza"
                tone="working"
                tasks={operationalWorkingRooms}
                onState={saveState}
              />
            </div>
          </section>

          <CleaningPrioritySection
            title="Salen hoy"
            countLabel={`${checkoutTodayRooms.length} habitaciones`}
            rooms={checkoutTodayRooms}
            rows={opsToday?.checkouts_today || []}
            date={date}
            tone="red"
            onState={saveState}
          />
          <CleaningPrioritySection
            title="Salen manana"
            countLabel={`${checkoutTomorrowRooms.length} habitaciones`}
            rooms={checkoutTomorrowRooms}
            rows={opsTomorrow?.checkouts_today || []}
            date={addDays(date, 1)}
            tone="orange"
            onState={saveState}
          />
          <CleaningPrioritySection
            title="Manana - 2° dia de estadia"
            countLabel={`${secondTomorrowRooms.length} habitaciones`}
            rooms={secondTomorrowRooms}
            rows={opsTomorrow?.second_day_cleaning || []}
            date={addDays(date, 1)}
            tone="purple"
            onState={saveState}
          />

          <section className="cleaning-priority-section">
            <div className="cleaning-section-title cleaning-room-section-title">
              <strong>Habitaciones</strong>
              <div className="cleaning-room-section-tools">
                <div className="cleaning-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar habitacion..." /></div>
                <span>{filteredRooms.length} habitaciones</span>
              </div>
            </div>
            <div className="cleaning-room-grid">
              {filteredRooms.slice(0, 24).map((room) => (
                <CleaningRoomCard
                  key={room.habitacion_id}
                  room={room}
                  operation={cleaningRoomOperation(room, [...(opsToday?.checkouts_today || []), ...(opsTomorrow?.checkouts_today || []), ...(opsTomorrow?.second_day_cleaning || [])])}
                  date={date}
                  notes={notes[room.habitacion_id] || ""}
                  onNotes={(value) => setNotes({ ...notes, [room.habitacion_id]: value })}
                  onState={saveState}
                  onSave={() => updateRoom(room)}
                />
              ))}
            </div>
          </section>
        </main>

        <aside className="cleaning-side">
          <section className="cleaning-side-card">
            <h3><Users size={17} />Asignacion rapida</h3>
            {quickRows.length === 0 && <p className="empty-copy">Sin habitaciones pendientes.</p>}
            {quickRows.map((room) => (
              <div className="cleaning-quick-row" key={room.habitacion_id}>
                <span>{cleaningInitial(room)}</span>
                <div><strong>Hab. {room.codigo_habitacion}</strong><small>{formatCleaningState(room.estado)}</small></div>
                <button onClick={() => saveState(room, room.estado === "limpiando" ? "limpio" : "limpiando")}>{room.estado === "limpiando" ? "Listo" : "Iniciar"}</button>
              </div>
            ))}
          </section>

          <section className="cleaning-side-card cleaning-progress-card">
            <h3><LayoutDashboard size={17} />Progreso del dia</h3>
            <div className="cleaning-progress-wrap">
              <div className="cleaning-ring" style={{ background: `conic-gradient(#18a46c 0 ${progress}%, #edf0f2 ${progress}% 100%)` }}><span>{progress}%</span></div>
              <div>
                <strong>{cleanRooms.length} / {rooms.length}</strong>
                <small>habitaciones listas</small>
              </div>
            </div>
            <ul>
              <li><i className="clean" />Limpias <strong>{cleanRooms.length}</strong></li>
              <li><i className="pending" />Por limpiar <strong>{pendingRooms.length}</strong></li>
              <li><i className="working" />En limpieza <strong>{workingRooms.length}</strong></li>
            </ul>
            <button onClick={() => api.downloadFile(`/api/cleaning/export.csv?date=${encodeURIComponent(date)}`, `limpieza-${date}.csv`)}><Download size={16} />Exportar reporte</button>
          </section>

          <section className="cleaning-side-card">
            <h3><BadgeCheck size={17} />Historial del dia</h3>
            {(report?.history || []).slice(0, 5).map((item) => (
              <div className="cleaning-history-row" key={item.id}>
                <strong>{item.codigo_habitacion}</strong>
                <span>{item.nombre_habitacion}</span>
                <small>{formatCleaningState(item.estado as CleaningRoom["estado"])}</small>
              </div>
            ))}
            {(report?.history || []).length === 0 && <p className="empty-copy">Sin historial para esta fecha.</p>}
          </section>
        </aside>
      </section>
    </section>
  );
}

function DesktopCleaningWorkspace(props: {
  date: string;
  setDate: (value: string) => void;
  rooms: CleaningRoom[];
  operations: OperationRow[];
  pendingCount: number;
  workingCount: number;
  checkoutCount: number;
  cleanCount: number;
  filter: CleaningFilter;
  setFilter: (value: CleaningFilter) => void;
  onState: (room: CleaningRoom, estado: CleaningRoom["estado"], targetDate?: string) => void;
  onRefresh: () => Promise<void>;
  onNavigate: (view: View) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [checks, setChecks] = useState([true, true, true, false, false, false]);
  const [note, setNote] = useState("");
  const selected = props.rooms.find((room) => room.habitacion_id === selectedId) || props.rooms.find((room) => room.prioridad === "salida") || props.rooms[0];
  const selectedOperation = selected ? cleaningRoomOperation(selected, props.operations) : undefined;
  const filterRooms = props.rooms.filter((room) => {
    const match = !query.trim() || `${room.codigo_habitacion} ${room.nombre_habitacion}`.toLowerCase().includes(query.trim().toLowerCase());
    if (!match) return false;
    if (props.filter === "por_limpiar") return needsCleaning(room);
    if (props.filter === "salida_hoy") return Boolean(cleaningRoomOperation(room, props.operations));
    if (props.filter === "segundo_dia") return room.prioridad === "segundo_dia";
    if (props.filter === "limpio") return room.estado === "limpio";
    return true;
  });
  const saveDetail = async (estado: CleaningRoom["estado"], close = false) => {
    if (!selected) return;
    await api.updateCleaning(selected.habitacion_id, { fecha: props.date, estado, prioridad: selected.prioridad, notas: note || selected.notas });
    await props.onRefresh();
    if (close) setSelectedId(null);
  };
  const navItems: { view: View; label: string; icon: ReactNode }[] = [
    { view: "today", label: "Hoy", icon: <Home size={17} /> }, { view: "calendar", label: "Calendario", icon: <CalendarDays size={17} /> }, { view: "cleaning", label: "Limpieza", icon: <Check size={17} /> }, { view: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> }, { view: "rooms", label: "Habitaciones", icon: <BedDouble size={17} /> }, { view: "airbnbReservations", label: "Reservas Airbnb", icon: <Home size={17} /> }, { view: "import", label: "Importar", icon: <FileSpreadsheet size={17} /> }, { view: "billing", label: "Cuenta de cobro", icon: <CreditCard size={17} /> }
  ];
  const checklist = ["Tender cama", "Barrer / trapear", "Baño limpio", "Reponer toallas", "Revisar amenidades", "Sacar basura"];

  return <section className="desktop-cleaning-workspace">
    <aside className="desktop-cleaning-sidebar"><div className="desktop-cleaning-logo"><img src="/logos/vista-montana-instagram.png" alt="Vista Montaña" /><strong>Vista Montaña<small>Apartasuites</small></strong></div><nav>{navItems.map((item) => <button key={item.view} className={item.view === "cleaning" ? "active" : ""} onClick={() => props.onNavigate(item.view)}>{item.icon}{item.label}</button>)}</nav></aside>
    <main className="desktop-cleaning-main">
      <header className="desktop-cleaning-header"><div><span>Control operativo</span><h1>Limpieza</h1><p>Selecciona una habitación para gestionar su limpieza</p></div><div><label><CalendarDays size={17} /><input type="date" value={props.date} onChange={(event) => props.setDate(event.target.value)} /></label><button className="primary" onClick={props.onRefresh}><RefreshCw size={17} />Actualizar</button></div></header>
      <section className="desktop-cleaning-metrics"><DesktopCleaningMetric icon={<Check size={25} />} label="Por limpiar" value={props.pendingCount} tone="red" /><DesktopCleaningMetric icon={<RotateCcw size={25} />} label="En limpieza" value={props.workingCount} tone="purple" /><DesktopCleaningMetric icon={<Upload size={25} />} label="Salen hoy" value={props.checkoutCount} tone="orange" /><DesktopCleaningMetric icon={<BadgeCheck size={25} />} label="Limpias" value={props.cleanCount} tone="green" /></section>
      <section className="desktop-cleaning-content"><section className="desktop-cleaning-list"><header><h2>Todas las habitaciones</h2><span>Haz clic en una habitación para ver su detalle</span></header><div className="desktop-cleaning-list-tools"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar habitación o huésped" /></label><span><LayoutDashboard size={17} /></span></div><div className="desktop-cleaning-filter-tabs">{([['todas','Todas'],['por_limpiar','Por limpiar'],['salida_hoy','Salen hoy'],['segundo_dia','2° día'],['limpio','Limpias']] as [CleaningFilter,string][]).map(([value,label]) => <button key={value} className={props.filter === value ? "active" : ""} onClick={() => props.setFilter(value)}>{label}</button>)}</div><div className="desktop-cleaning-room-grid">{filterRooms.map((room) => { const operation = cleaningRoomOperation(room, props.operations); return <button key={room.habitacion_id} className={selected?.habitacion_id === room.habitacion_id ? "selected" : ""} onClick={() => { setSelectedId(room.habitacion_id); setNote(room.notas || ""); }}><strong>{room.codigo_habitacion}</strong><b>{operation?.huesped || room.nombre_habitacion || "Sin huésped"}</b><small>{operation?.salida ? `Check-out: ${operation.salida}` : formatCleaningState(room.estado)}</small><span>{channelLabel(operation?.canal || "whatsapp")}</span><i>{room.prioridad === "segundo_dia" ? "2° día" : room.estado === "limpio" ? "Limpia" : "Salida hoy"}</i></button>; })}</div></section>
      <aside className="desktop-cleaning-detail"><header><h2>Detalle de limpieza</h2><span>● Información en tiempo real</span></header>{selected ? <><section className="desktop-detail-room"><strong>{selected.codigo_habitacion}</strong><div><b>Habitación {selected.codigo_habitacion}</b><span>{selectedOperation?.huesped || selected.nombre_habitacion}</span><small>{selectedOperation?.salida ? `Check-out: ${selectedOperation.salida}` : "Limpieza programada"}</small></div><i>{channelLabel(selectedOperation?.canal || "whatsapp")}</i></section><div className="desktop-detail-actions"><button className="primary" onClick={() => saveDetail("limpiando")}><Check size={17} />Iniciar limpieza</button><button onClick={() => saveDetail("limpio")}><Check size={17} />Marcar como limpia</button><button className="danger" onClick={() => setNote((value) => `${value}${value ? " " : ""}NOVEDAD: `)}><AlertCircle size={17} />Reportar novedad</button></div><section className="desktop-detail-checklist"><h3>Checklist rápido</h3><div>{checklist.map((item,index) => <button key={item} className={checks[index] ? "checked" : ""} onClick={() => setChecks((current) => current.map((value,itemIndex) => itemIndex === index ? !value : value))}><Check size={15} />{item}<i><Check size={14} /></i></button>)}</div></section><section className="desktop-detail-notes"><h3>Notas y evidencia</h3><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escribe una observación sobre la limpieza..." /><label><ImagePlus size={24} />Arrastra fotos aquí<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await api.uploadCleaningEvidence(selected.habitacion_id, props.date, note, file); }} /></label></section><footer><button onClick={() => saveDetail(selected.estado)}><Save size={17} />Guardar avance</button><button className="primary" onClick={() => saveDetail("limpio", true)}><Check size={17} />Finalizar limpieza</button></footer></> : <p className="empty-copy">Selecciona una habitación para ver su detalle.</p>}</aside></section>
    </main>
  </section>;
}

function DesktopCleaningMetric(props: { icon: ReactNode; label: string; value: number; tone: string }) { return <article className={props.tone}><span>{props.icon}</span><div><small>{props.label}</small><strong>{props.value}</strong><em>habitaciones</em></div></article>; }

function MobileCleaningHomeReference(props: {
  date: string;
  setDate: (value: string) => void;
  rooms: CleaningRoom[];
  checkoutRows: OperationRow[];
  tomorrowRows: OperationRow[];
  secondDayRows: OperationRow[];
  cleanCount: number;
  pendingCount: number;
  workingCount: number;
  checkoutCount: number;
  filter: CleaningFilter;
  setFilter: (value: CleaningFilter) => void;
  onRefresh: () => Promise<void>;
  onMenuChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<{ room: CleaningRoom; operation?: OperationRow } | null>(null);
  const filters: { value: CleaningFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "por_limpiar", label: "Por limpiar" },
    { value: "limpiando", label: "En limpieza" },
    { value: "salida_hoy", label: "Salen hoy" },
    { value: "salida_manana", label: "Salen mañana" },
    { value: "segundo_dia", label: "2° día" },
    { value: "limpio", label: "Limpias" }
  ];
  const checkoutIds = operationRoomIds(props.checkoutRows);
  const tomorrowIds = operationRoomIds(props.tomorrowRows);
  const secondDayIds = operationRoomIds(props.secondDayRows);
  const operationRows = [...props.checkoutRows, ...props.tomorrowRows, ...props.secondDayRows];
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRooms = props.rooms.filter((room) => {
    if (normalizedSearch && !`${room.codigo_habitacion} ${room.nombre_habitacion || ""} ${room.estado}`.toLowerCase().includes(normalizedSearch)) return false;
    if (props.filter === "por_limpiar") return needsCleaning(room);
    if (props.filter === "limpiando") return room.estado === "limpiando";
    if (props.filter === "salida_hoy") return checkoutIds.has(room.habitacion_id);
    if (props.filter === "salida_manana") return tomorrowIds.has(room.habitacion_id);
    if (props.filter === "segundo_dia") return secondDayIds.has(room.habitacion_id);
    if (props.filter === "limpio") return room.estado === "limpio";
    return true;
  });

  return <section className="mobile-cleaning-reference">
    <header className="mobile-cleaning-top">
      <div className="mobile-cleaning-topbar"><button type="button" className="mobile-cleaning-top-icon" aria-label="Abrir menú" onClick={() => props.onMenuChange(true)}><Menu size={22} /></button><div className="mobile-cleaning-brand"><img src="/logos/vista-montana-instagram.png" alt="Vista Montaña" /><span>Vista Montaña<small>Apartasuites</small></span></div><button type="button" className="mobile-cleaning-top-icon" aria-label="Notificaciones"><Bell size={21} /></button></div>
      <div className="mobile-cleaning-heading"><h1>Limpieza</h1><p>Gestiona la limpieza de las habitaciones</p></div>
      <div className="mobile-cleaning-date-row"><label><CalendarDays size={20} /><input type="date" value={props.date} onChange={(event) => props.setDate(event.target.value)} /><ChevronRight size={17} /></label><button type="button" className="mobile-cleaning-refresh" onClick={() => void props.onRefresh()}><RefreshCw size={17} />Actualizar</button></div>
    </header>
    <section className="mobile-cleaning-kpis">
      <MobileCleaningMetric icon={<Check size={24} />} label="Por limpiar" value={props.pendingCount} tone="green" />
      <MobileCleaningMetric icon={<RotateCcw size={24} />} label="En limpieza" value={props.workingCount} tone="purple" />
      <MobileCleaningMetric icon={<Upload size={24} />} label="Salen hoy" value={props.checkoutCount} tone="orange" />
      <MobileCleaningMetric icon={<BadgeCheck size={24} />} label="Limpias" value={props.cleanCount} tone="mint" />
    </section>
    <div className="mobile-cleaning-filters">{filters.map((item) => <button type="button" key={item.value} className={props.filter === item.value ? "active" : ""} onClick={() => props.setFilter(item.value)}>{item.label}</button>)}</div>
    <section className="mobile-cleaning-section mobile-all-rooms-section">
      <header><div><LayoutDashboard size={21} /><h2>Todas las habitaciones</h2></div><div className="mobile-cleaning-view-toggle"><button type="button" aria-label="Vista de cuadrícula" className="active"><LayoutDashboard size={17} /></button><button type="button" aria-label="Vista de lista"><Menu size={17} /></button></div></header>
      <label className="mobile-cleaning-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar habitación o huésped" /></label>
      <div className="mobile-cleaning-room-list">{visibleRooms.map((room) => { const operation = cleaningRoomOperation(room, operationRows); const status = secondDayIds.has(room.habitacion_id) ? "2° día" : room.estado === "limpio" ? "Limpia" : checkoutIds.has(room.habitacion_id) ? "Salida hoy" : "Por limpiar"; return <button type="button" className="mobile-cleaning-room-row" key={room.habitacion_id} onClick={() => setSelectedRoom({ room, operation })}><strong>{room.codigo_habitacion}</strong><span><b>{operation?.huesped || room.nombre_habitacion || "Habitación"}</b><small>{operation?.salida ? `Check-out: ${operation.salida}` : "Limpieza programada"}</small><em>{channelLabel(operation?.canal || "whatsapp")}</em></span><i className={status === "Limpia" ? "clean" : status === "2° día" ? "second" : "pending"}>{status}</i><ChevronRight size={19} /></button>; })}{visibleRooms.length === 0 && <p className="empty-copy">No hay habitaciones en este filtro.</p>}</div>
    </section>
    {selectedRoom && <MobileCleaningDetailPanel room={selectedRoom.room} operation={selectedRoom.operation} date={props.date} onClose={() => setSelectedRoom(null)} onRefresh={props.onRefresh} />}
  </section>;
}

function MobileCleaningMetric(props: { icon: ReactNode; label: string; value: number; tone: string }) {
  return <article className={props.tone}><span>{props.icon}</span><div><small>{props.label}</small><strong>{props.value}</strong><em>habitaciones</em></div></article>;
}

function MobileCleaningDetailPanel(props: { room: CleaningRoom; operation?: OperationRow; date: string; onClose: () => void; onRefresh: () => Promise<void> }) {
  const checklistLabels = ["Tender cama", "Barrer / trapear", "Baño limpio", "Reponer toallas", "Revisar amenidades"];
  const checklistIcons = [<BedDouble size={25} />, <Sparkles size={24} />, <BadgeCheck size={24} />, <FileText size={22} />, <ImagePlus size={22} />];
  const [checks, setChecks] = useState<boolean[]>(() => checklistLabels.map(() => false));
  const [note, setNote] = useState(props.room.notas || "");
  const [incident, setIncident] = useState(false);
  const [evidence, setEvidence] = useState<CleaningEvidence[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.cleaningEvidence(props.room.habitacion_id, props.date).then(setEvidence).catch(() => setEvidence([]));
  }, [props.room.habitacion_id, props.date]);

  const persist = async (estado: CleaningRoom["estado"], close = false) => {
    setSaving(true); setError("");
    try {
      const checklist = checklistLabels.filter((_item, index) => checks[index]).join(", ");
      const details = [incident ? "NOVEDAD REPORTADA." : "", note.trim(), checklist ? `Checklist: ${checklist}.` : ""].filter(Boolean).join(" ");
      await api.updateCleaning(props.room.habitacion_id, { fecha: props.date, estado, prioridad: props.room.prioridad, notas: details });
      await props.onRefresh();
      if (close) props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la limpieza.");
    } finally { setSaving(false); }
  };

  const addEvidence = async (file?: File) => {
    if (!file) return;
    setSaving(true); setError("");
    try {
      const item = await api.uploadCleaningEvidence(props.room.habitacion_id, props.date, note, file);
      setEvidence((current) => [item, ...current]);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la foto."); }
    finally { setSaving(false); }
  };

  return (
    <aside className="mobile-cleaning-detail" role="dialog" aria-modal="true" aria-labelledby="cleaning-detail-title">
      <header><button className="icon" aria-label="Cerrar detalle de limpieza" onClick={props.onClose}><ChevronLeft size={27} /></button><div className="mobile-cleaning-detail-brand"><img src="/logos/vista-montana-instagram.png" alt="Vista Montaña" /><span>Vista Montaña<small>Apartasuites</small></span></div><strong id="cleaning-detail-title">Detalle de limpieza</strong></header>
      <section className="mobile-cleaning-detail-body">
        {error && <p className="cleaning-detail-error">{error}</p>}
        <section className="cleaning-detail-summary"><strong>{props.room.codigo_habitacion}</strong><div><b>{props.operation?.huesped || props.room.nombre_habitacion || "Habitación"}</b><small>{props.operation?.salida ? `Check-out: ${props.operation.salida}` : "Limpieza programada"}</small><em>{props.room.prioridad === "segundo_dia" ? "2° día" : "Salida hoy"}</em></div></section>
        <div className="cleaning-detail-actions"><button className="start" disabled={saving} onClick={() => persist("limpiando")}><Sparkles size={31} />Iniciar limpieza</button><button className="clean" disabled={saving} onClick={() => persist("limpio")}><CircleCheck size={34} />Marcar como limpia</button><button className={incident ? "incident active" : "incident"} type="button" onClick={() => setIncident((value) => !value)}><AlertCircle size={34} />Reportar novedad</button></div>
        <section className="cleaning-detail-checklist"><h2>Checklist rápido</h2>{checklistLabels.map((label, index) => <button key={label} className={checks[index] ? "checked" : ""} onClick={() => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))}><span>{checklistIcons[index]}</span>{label}<i><Check size={19} /></i></button>)}</section>
        <section className="cleaning-detail-notes"><h2>Notas y evidencia</h2><label><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={incident ? "Describe la novedad..." : "Escribe una observación..."} /><span><ImagePlus size={19} /></span></label><div className="cleaning-evidence-grid">{evidence.map((item) => <img key={item.id} src={item.ruta_archivo} alt="Evidencia de limpieza" />)}<label className="cleaning-add-photo"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => addEvidence(event.target.files?.[0])} /><ImagePlus size={24} />Agregar foto</label></div></section>
        <footer><button disabled={saving} onClick={() => persist(props.room.estado)}><Save size={18} />Guardar avance</button><button className="primary" disabled={saving} onClick={() => persist("limpio", true)}><Check size={18} />Finalizar limpieza</button></footer>
      </section>
    </aside>
  );
}

function CleaningKpi(props: { icon: ReactNode; label: string; value: number | string; delta: string; tone: string }) {
  return (
    <article className={`cleaning-kpi ${props.tone}`}>
      <span>{props.icon}</span>
      <div><small>{props.label}</small><strong>{props.value}</strong><em>{props.delta}</em></div>
    </article>
  );
}

function CleaningOperationalColumn(props: {
  title: string;
  tone: "pending" | "working";
  tasks: OperationalCleaningTask[];
  onState: (room: CleaningRoom, estado: CleaningReport["rooms"][number]["estado"], targetDate?: string) => void;
}) {
  return (
    <section className={`cleaning-operational-column ${props.tone}`}>
      <div className="cleaning-operational-heading">
        <strong>{props.title}</strong>
        <span>{props.tasks.length}</span>
      </div>
      {props.tasks.length === 0 && <p className="empty-copy">Sin habitaciones en este estado.</p>}
      <div className="cleaning-operational-list">
        {props.tasks.map((task) => (
          <div className="cleaning-operational-row" key={`${task.room.habitacion_id}-${task.date}`}>
            <div>
              <strong>Hab. {task.room.codigo_habitacion}</strong>
              <small>{task.dayLabel} · {task.room.nombre_habitacion}</small>
            </div>
            <button type="button" onClick={() => props.onState(task.room, props.tone === "pending" ? "limpiando" : "limpio", task.date)}>
              {props.tone === "pending" ? "Iniciar" : "Marcar limpia"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function CleaningPrioritySection(props: {
  title: string;
  countLabel: string;
  rooms: CleaningRoom[];
  rows: OperationRow[];
  date: string;
  tone: string;
  onState: (room: CleaningRoom, estado: CleaningReport["rooms"][number]["estado"], targetDate?: string) => void;
}) {
  return (
    <section className={`cleaning-priority-section ${props.tone}`}>
      <div className="cleaning-section-title">
        <strong>{props.title}</strong>
        <span>{props.countLabel}</span>
      </div>
      {props.rooms.length === 0 && <div className="cleaning-empty">Sin habitaciones en esta prioridad.</div>}
      <div className="cleaning-priority-grid">
        {props.rooms.map((room) => (
          <CleaningRoomCard
            key={`${props.title}-${room.habitacion_id}`}
            room={room}
            operation={cleaningRoomOperation(room, props.rows)}
            date={props.date}
            notes={room.notas || ""}
            onNotes={() => {}}
            onState={props.onState}
            compact
          />
        ))}
      </div>
    </section>
  );
}

function CleaningRoomCard(props: {
  room: CleaningRoom;
  operation?: OperationRow;
  date: string;
  notes: string;
  onNotes?: (value: string) => void;
  onState: (room: CleaningRoom, estado: CleaningReport["rooms"][number]["estado"], targetDate?: string) => void;
  onSave?: () => void;
  compact?: boolean;
}) {
  const channel = props.operation?.canal || "";
  return (
    <article className={`cleaning-room-card ${cleaningTone(props.room.estado)} ${props.room.prioridad === "urgente" ? "urgent" : ""}`}>
      <div className="cleaning-room-card-head">
        <div>
          <strong>{props.room.codigo_habitacion}</strong>
          <span>{props.room.nombre_habitacion}</span>
        </div>
        <small>{formatCleaningState(props.room.estado)}</small>
      </div>
      <div className="cleaning-room-card-body">
        <span>{props.operation?.huesped || "Sin reserva asociada"}</span>
        <small>{props.operation ? `Check-out: 11:00 · ${props.operation.salida || props.date}` : props.room.fecha_estado || props.date}</small>
        {channel && <i className={`cleaning-channel-badge ${channel.toLowerCase() === "airbnb" ? "airbnb" : "whatsapp"}`}><img src={`/logos/${channel.toLowerCase() === "airbnb" ? "airbnb" : "whatsapp"}.svg`} alt="" />{channelLabel(channel)}</i>}
      </div>
      {!props.compact && (
        <label className="cleaning-note-input">Notas
          <input value={props.notes} onChange={(event) => props.onNotes?.(event.target.value)} />
        </label>
      )}
      <div className="cleaning-room-actions">
        <button className={`state-action pending ${props.room.estado === "por limpiar" || props.room.estado === "sin limpiar" ? "active" : ""}`} onClick={() => props.onState(props.room, "por limpiar", props.date)}>Por limpiar</button>
        <button className={`state-action working ${props.room.estado === "limpiando" ? "active" : ""}`} onClick={() => props.onState(props.room, "limpiando", props.date)}>En limpieza</button>
        <button className={`state-action clean ${props.room.estado === "limpio" ? "active" : ""}`} onClick={() => props.onState(props.room, "limpio", props.date)}>Limpio</button>
      </div>
      {props.onSave && <button className="cleaning-save-note" onClick={props.onSave}><Save size={15} />Guardar nota</button>}
    </article>
  );
}

function DashboardView(props: { dashboard: Dashboard | null; onSelect: (reservation: Reservation) => void; onNavigate: (view: View) => void }) {
  const defaultStart = props.dashboard?.period_start || `${currentMonth}-01`;
  const defaultEnd = props.dashboard?.period_end || `${shiftMonth(currentMonth, 1)}-01`;
  const [range, setRange] = useState({ start: defaultStart, end: defaultEnd });
  const [channel, setChannel] = useState<"todos" | "airbnb" | "whatsapp">("todos");
  const [dashboard, setDashboard] = useState<Dashboard | null>(props.dashboard);
  const [guestSearch, setGuestSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dashboard && props.dashboard) setDashboard(props.dashboard);
  }, [props.dashboard, dashboard]);

  const loadDashboard = () => {
    setLoading(true);
    setError("");
    api.dashboard(channel === "todos" ? range : { ...range, origen_reserva: channel })
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard."))
      .finally(() => setLoading(false));
  };

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

  if (!dashboard) return <div className="empty-state">Sin datos de dashboard.</div>;

  const guestRows = Array.from(
    new Map(
      [
        ...dashboard.proximos_ingresos,
        ...dashboard.proximas_salidas,
        ...dashboard.reservas_con_saldo_periodo
      ].map((reservation) => [reservation.id, reservation])
    ).values()
  );
  const filteredGuests = guestRows
    .filter((reservation) => {
      const query = guestSearch.trim().toLowerCase();
      if (!query) return true;
      return [
        reservation.nombre_completo_huesped,
        roomLabel(reservation),
        reservation.numero_remision,
        reservation.origen_reserva
      ].join(" ").toLowerCase().includes(query);
    })
    .slice(0, 8);
  const channelData = ["airbnb", "whatsapp"].map((origin) =>
    dashboard.resumen_por_canal?.find((item) => item.origen === origin) || { origen: origin, reservas: 0, ingresos: 0, abonado: 0, saldo: 0 }
  );
  const estadoPagoCount = (name: string) => dashboard.reservas_por_estado_pago.find((item) => item.estado === name)?.total || 0;
  const paidCount = estadoPagoCount("pagado_total");
  const pendingCount = dashboard.reservas_con_saldo_pendiente;
  const unpaidCount = estadoPagoCount("sin_pago");
  const noReceiptCount = dashboard.reservas_sin_comprobante;
  const carteraTotal = Math.max(1, paidCount + pendingCount + unpaidCount + noReceiptCount);
  const statusSegments = [
    { className: "paid", value: paidCount, label: "Pagado total" },
    { className: "pending", value: pendingCount, label: "Con saldo pendiente" },
    { className: "unpaid", value: unpaidCount, label: "Sin pago" },
    { className: "missing", value: noReceiptCount, label: "Sin comprobante" }
  ];
  const maxIncome = Math.max(1, ...(dashboard.ingresos_por_dia || []).map((item) => Number(item.total || 0)));
  const incomeRows = (dashboard.ingresos_por_dia || []).slice(-31);
  const methodRows = dashboard.total_por_metodo_pago.slice(0, 8);
  const methodMax = Math.max(1, ...methodRows.map((row) => Number(row.total || 0)));
  const channelTotal = Math.max(1, dashboard.reservas_por_canal?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0);
  const whatsappTotal = dashboard.reservas_por_canal?.find((item) => item.canal === "whatsapp")?.total || 0;
  const airbnbTotal = dashboard.reservas_por_canal?.find((item) => item.canal === "airbnb")?.total || 0;
  const whatsappPct = Math.round((Number(whatsappTotal || 0) / channelTotal) * 100);
  const dashboardMonth = range.start.slice(0, 7);
  const setDashboardMonth = (monthValue: string) => {
    setRange({ start: `${monthValue}-01`, end: `${shiftMonth(monthValue, 1)}-01` });
  };
  const kpis = [
    { label: "Reservas del periodo", value: dashboard.reservas_periodo, icon: <CalendarDays size={21} />, tone: "green", delta: "+ datos reales" },
    { label: "Ingresos estimados", value: formatMoney(dashboard.ingresos_estimados_mes), icon: <CircleDollarSign size={21} />, tone: "purple", delta: "periodo seleccionado" },
    { label: "Abonado recibido", value: formatMoney(dashboard.total_abonado_mes), icon: <Wallet size={21} />, tone: "blue", delta: "pagos registrados" },
    { label: "Saldo pendiente", value: formatMoney(dashboard.saldo_periodo), icon: <CreditCard size={21} />, tone: "orange", delta: "por cobrar" }
  ];
  const navItems = [
    { view: "today" as View, label: "Hoy", icon: <Home size={17} /> },
    { view: "calendar" as View, label: "Calendario", icon: <CalendarDays size={17} /> },
    { view: "cleaning" as View, label: "Limpieza", icon: <Check size={17} /> },
    { view: "dashboard" as View, label: "Dashboard", icon: <LayoutDashboard size={17} /> },
    { view: "rooms" as View, label: "Habitaciones", icon: <BedDouble size={17} /> },
    { view: "airbnbReservations" as View, label: "Reservas Airbnb", icon: <Home size={17} /> },
    { view: "import" as View, label: "Importar", icon: <FileSpreadsheet size={17} /> },
    { view: "billing" as View, label: "Cuenta de cobro", icon: <CreditCard size={17} /> }
  ];

  return (
    <section className="dashboard-page vm-dashboard">
      <aside className="vm-dashboard-sidebar">
        <div className="vm-sidebar-brand">
          <span className="brand-mark">
            <img src="/logos/vista-montana-instagram.png" alt="Logo Vista Montaña" />
          </span>
          <div><strong>Vista Montaña</strong><small>Apartasuites</small></div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.view} className={item.view === "dashboard" ? "active" : ""} onClick={() => props.onNavigate(item.view)}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="vm-dashboard-main">
        <section className="vm-dashboard-topbar">
          <div className="vm-dashboard-heading">
            <h1>Dashboard Operativo</h1>
            <span><CalendarDays size={15} />{range.start} - {addDays(range.end, -1)}</span>
          </div>
          <div className="vm-dashboard-controls">
            <div className="vm-month-switcher">
              <button className="icon" title="Mes anterior" onClick={() => setDashboardMonth(shiftMonth(dashboardMonth, -1))}><ChevronLeft size={18} /></button>
              <input type="month" value={dashboardMonth} onChange={(event) => setDashboardMonth(event.target.value)} />
              <button className="icon" title="Mes siguiente" onClick={() => setDashboardMonth(shiftMonth(dashboardMonth, 1))}><ChevronRight size={18} /></button>
            </div>
            <label>Desde<input type="date" value={range.start} onChange={(event) => setRange({ ...range, start: event.target.value })} /></label>
            <label>Hasta<input type="date" value={addDays(range.end, -1)} onChange={(event) => setRange({ ...range, end: addDays(event.target.value, 1) })} /></label>
            <button onClick={() => api.downloadFile("/api/export/reservations.csv", "dashboard-reservas.csv")}><Download size={17} />Exportar</button>
            <button className="primary" onClick={loadDashboard}><RefreshCw size={17} />Actualizar</button>
          </div>
        </section>

        {error && <div className="notice error">{error}</div>}
        {loading && <div className="notice">Actualizando dashboard...</div>}

        <section className="vm-kpi-grid">
          {kpis.map((card) => (
            <article className={`vm-kpi-card ${card.tone}`} key={card.label}>
              <span className="vm-kpi-icon">{card.icon}</span>
              <div><small>{card.label}</small><strong>{card.value}</strong><em>{card.delta}</em></div>
            </article>
          ))}
        </section>

        <section className="vm-dashboard-middle">
          <article className="vm-card vm-channel-card">
            <div className="vm-card-title">
              <h2>Comparativo por canal</h2>
              <button className={channel === "todos" ? "active-filter" : ""} onClick={() => setChannel("todos")}>Todos</button>
            </div>
            <div className="vm-channel-grid">
              {channelData.map((row) => (
                <button className={`vm-channel-box ${row.origen} ${channel === row.origen ? "active" : ""}`} key={row.origen} onClick={() => setChannel(row.origen as "airbnb" | "whatsapp")}>
                  <div className="vm-channel-head">
                    <span><img src={row.origen === "airbnb" ? "/logos/airbnb.svg" : "/logos/whatsapp.svg"} alt={row.origen === "airbnb" ? "Airbnb" : "WhatsApp"} /></span>
                    <strong>{row.origen === "airbnb" ? "Airbnb" : "WhatsApp"}</strong>
                    <small>{row.reservas} reservas</small>
                  </div>
                  <div><small>Ingresos</small><b>{formatMoney(row.ingresos)}</b></div>
                  <div><small>Pagado</small><b>{formatMoney(row.abonado)}</b></div>
                  <div className="channel-balance"><small>Saldo</small><b>{formatMoney(row.saldo)}</b></div>
                </button>
              ))}
            </div>
          </article>

          <article className="vm-card vm-portfolio-card">
            <h2>Estado de cartera</h2>
            <p><strong>{dashboard.reservas_periodo}</strong> reservas del periodo</p>
            <div className="vm-portfolio-bar">
              {statusSegments.map((item) => (
                <span key={item.className} className={item.className} style={{ width: `${Math.max(3, (item.value / carteraTotal) * 100)}%` }} title={item.label} />
              ))}
            </div>
            <div className="vm-portfolio-stats">
              {statusSegments.map((item) => (
                <div key={item.className}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                  <small>{Math.round((item.value / carteraTotal) * 100)}%</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="vm-card dashboard-guest-list">
          <div className="vm-card-title">
            <h2>Lista de huespedes</h2>
            <div className="vm-guest-search"><Search size={15} /><input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Buscar huesped, habitacion o reserva..." /></div>
          </div>
          {filteredGuests.length === 0 && <p className="empty-copy">Sin reservas relevantes para mostrar.</p>}
          {filteredGuests.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Huesped</th><th>Hab.</th><th>Canal</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGuests.map((reservation) => (
                    <tr key={reservation.id} onClick={() => props.onSelect(reservation)}>
                      <td>{reservation.nombre_completo_huesped}</td>
                      <td>{roomLabel(reservation)}</td>
                      <td><span className={`vm-badge ${reservation.origen_reserva === "airbnb" ? "airbnb" : "whatsapp"}`}>{reservation.origen_reserva === "airbnb" ? "Airbnb" : "WhatsApp"}</span></td>
                      <td>{reservation.fecha_ingreso}</td>
                      <td>{reservation.fecha_salida}</td>
                      <td>{formatMoney(reservation.total_pago)}</td>
                      <td>{formatMoney(reservation.abono)}</td>
                      <td className={reservation.saldo > 0 ? "vm-money-warning" : "vm-money-ok"}>{formatMoney(reservation.saldo)}</td>
                      <td><span className={`vm-status ${reservation.saldo > 0 ? "pending" : "paid"}`}>{reservation.saldo > 0 ? "Con saldo" : "Pagado"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <small>Mostrando {filteredGuests.length} de {guestRows.length} reservas relevantes</small>
        </section>

        <section className="vm-bottom-grid">
          <article className="vm-card vm-income-card">
            <div className="vm-card-title"><h2>Ingresos por dia</h2><select defaultValue="mes"><option value="mes">Este mes</option></select></div>
            <div className="vm-income-bars">
              {incomeRows.map((item) => (
                <span key={item.fecha} style={{ height: `${Math.max(8, (Number(item.total || 0) / maxIncome) * 100)}%` }} title={`${item.fecha}: ${formatMoney(item.total)}`}><i>{item.fecha.slice(8)}</i></span>
              ))}
            </div>
          </article>

          <article className="vm-card vm-method-card">
            <h2>Total por metodo de pago</h2>
            <div className="vm-method-bars">
              {methodRows.map((item, index) => (
                <div key={item.metodo}>
                  <span>{item.metodo}</span>
                  <b><i style={{ width: `${Math.max(5, (Number(item.total || 0) / methodMax) * 100)}%`, background: ["#b17ae6", "#5aa4df", "#68c399", "#f2bd59", "#ef8c7a", "#7ec7d9", "#c5c5c5"][index % 7] }} /></b>
                  <strong>{formatMoney(item.total)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="vm-card vm-donut-card">
            <h2>Reservas por canal</h2>
            <div className="vm-donut-wrap">
              <div className="vm-donut" style={{ background: `conic-gradient(#56b985 0 ${whatsappPct}%, #9b6ed4 ${whatsappPct}% 100%)` }}>
                <span><strong>{channelTotal}</strong>Total</span>
              </div>
              <div className="vm-donut-legend">
                <span><i className="whatsapp" />WhatsApp {whatsappTotal}</span>
                <span><i className="airbnb" />Airbnb {airbnbTotal}</span>
              </div>
            </div>
          </article>
        </section>
      </main>

      <aside className="vm-dashboard-right">
        <article className="vm-side-card">
          <h3><CalendarDays size={16} />Hoy</h3>
          <div><strong>{dashboard.reservas_hoy}</strong><span>Reservas hoy</span></div>
          <div><strong>{dashboard.habitaciones_ocupadas_hoy}</strong><span>Ocupadas hoy</span></div>
          <div><strong>{dashboard.habitaciones_disponibles_hoy}</strong><span>Disponibles hoy</span></div>
          <div><strong>{dashboard.habitaciones_bloqueadas}</strong><span>Bloqueadas hoy</span></div>
        </article>

        <article className="vm-side-card alert">
          <h3><AlertCircle size={16} />Alertas</h3>
          <div><span>Reservas con saldo</span><strong>{dashboard.reservas_con_saldo_pendiente}</strong></div>
          <div><span>Sin comprobante</span><strong>{dashboard.reservas_sin_comprobante}</strong></div>
          <div><span>Saldos pendientes</span><strong>{formatMoney(dashboard.saldos_pendientes)}</strong></div>
          <button onClick={() => props.onNavigate("calendar")}>Ver todas las alertas</button>
        </article>

        <article className="vm-side-card list">
          <h3><CalendarDays size={16} />Proximos ingresos</h3>
          {dashboard.proximos_ingresos.slice(0, 3).map((reservation) => (
            <button key={reservation.id} onClick={() => props.onSelect(reservation)}>
              <strong>{reservation.nombre_completo_huesped}</strong>
              <span>{roomLabel(reservation)} · {reservation.fecha_ingreso} - {reservation.fecha_salida}</span>
              <small>{formatMoney(reservation.total_pago)}</small>
            </button>
          ))}
        </article>

        <article className="vm-side-card list">
          <h3><CalendarDays size={16} />Proximas salidas</h3>
          {dashboard.proximas_salidas.slice(0, 3).map((reservation) => (
            <button key={reservation.id} onClick={() => props.onSelect(reservation)}>
              <strong>{reservation.nombre_completo_huesped}</strong>
              <span>{roomLabel(reservation)} · {reservation.fecha_ingreso} - {reservation.fecha_salida}</span>
              <small>{formatMoney(reservation.total_pago)}</small>
            </button>
          ))}
        </article>
      </aside>
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

function safeCalendarColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value || "#184B24" : "#184B24";
}

function formatListingMoney(value: unknown, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Sin dato";
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
  } catch (_error) {
    return `${currency} ${amount}`;
  }
}

function RoomsView(props: { rooms: Room[]; reservations: Reservation[]; onSaved: () => void; onBlock: () => void }) {
  const [editing, setEditing] = useState<Room | null>(null);
  const [roomQuery, setRoomQuery] = useState("");
  const [roomStatusFilter, setRoomStatusFilter] = useState<"todas" | "disponibles" | "ocupadas" | "limpieza" | "bloqueadas" | "pendientes" | "airbnb">("todas");
  const [form, setForm] = useState({
    codigo_habitacion: "",
    nombre_habitacion: "",
    tipo_habitacion: "",
    descripcion: "",
    capacidad: "2",
    precio_base_noche: "0",
    estado: "disponible",
    color_calendario: "#184B24",
    foto_url: "",
    pendiente_revision: 0,
    airbnb_listing_id: "",
    airbnb_ical_url: "",
    airbnb_ical_activo: 0,
    airbnb_ultima_sincronizacion: "",
    airbnb_ultimo_estado: "",
    airbnb_ultimo_error: ""
  });
  const [busyIcal, setBusyIcal] = useState(false);
  const [icalOpen, setIcalOpen] = useState(false);
  const [syncingAllIcal, setSyncingAllIcal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const occupiedRoomIds = useMemo(() => {
    const ids = new Set<number>();
    props.reservations
      .filter((reservation) => reservation.estado_reserva !== "cancelada" && today >= reservation.fecha_ingreso && today < effectiveEnd(reservation.fecha_ingreso, reservation.fecha_salida))
      .forEach((reservation) => reservation.rooms.forEach((room) => ids.add(room.habitacion_id)));
    return ids;
  }, [props.reservations]);
  const filteredRooms = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    return props.rooms.filter((room) => {
      const matchesQuery = !query ||
        room.codigo_habitacion.toLowerCase().includes(query) ||
        room.nombre_habitacion.toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (roomStatusFilter === "disponibles") return room.estado === "disponible" && !occupiedRoomIds.has(room.id);
      if (roomStatusFilter === "ocupadas") return occupiedRoomIds.has(room.id);
      if (roomStatusFilter === "limpieza") return room.estado === "mantenimiento";
      if (roomStatusFilter === "bloqueadas") return room.estado === "inactiva";
      if (roomStatusFilter === "pendientes") return Boolean(room.pendiente_revision);
      if (roomStatusFilter === "airbnb") return Boolean(room.airbnb_ical_activo);
      return true;
    });
  }, [occupiedRoomIds, props.rooms, roomQuery, roomStatusFilter]);
  const airbnbActiveCount = props.rooms.filter((room) => Number(room.airbnb_ical_activo || 0) === 1).length;
  const lastAirbnbSyncAt = useMemo(() => getLatestAirbnbSyncAt(props.rooms), [props.rooms]);

  useEffect(() => {
    setIcalOpen(Boolean(editing?.airbnb_ical_url));
    if (editing) {
      setForm({
        codigo_habitacion: editing.codigo_habitacion,
        nombre_habitacion: editing.nombre_habitacion,
        tipo_habitacion: editing.tipo_habitacion,
        descripcion: editing.descripcion,
        capacidad: String(editing.capacidad),
        precio_base_noche: String(editing.precio_base_noche),
        estado: editing.estado,
        color_calendario: safeCalendarColor(editing.color_calendario),
        foto_url: editing.foto_url || "",
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
    setIcalOpen(false);
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
      foto_url: "",
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

  const syncAllIcal = async () => {
    setSyncingAllIcal(true);
    setError("");
    setMessage("");
    try {
      const result = await api.syncAllAirbnbFeeds();
      const totals = result.results.reduce<{ created: number; updated: number; blocked: number; cancelled: number; errors: number }>((acc, item) => {
        acc.created += Number(item.created || 0);
        acc.updated += Number(item.updated || 0);
        acc.blocked += Number(item.blocked || 0);
        acc.cancelled += Number(item.cancelled || 0);
        acc.errors += item.status === "error" ? 1 : 0;
        return acc;
      }, { created: 0, updated: 0, blocked: 0, cancelled: 0, errors: 0 });
      setMessage(`iCal sincronizado: ${totals.created} reservas nuevas, ${totals.updated} actualizadas, ${totals.blocked} bloqueos, ${totals.cancelled} canceladas${totals.errors ? `, ${totals.errors} errores` : ""}.`);
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar iCal.");
    } finally {
      setSyncingAllIcal(false);
    }
  };

  return (
    <section className="rooms-page">
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      <section className="rooms-hero">
        <div>
          <h1>Habitaciones</h1>
          <p>Administra disponibilidad, precios e integracion Airbnb iCal.</p>
        </div>
        <div className="rooms-hero-actions">
          <AirbnbSyncButton syncing={syncingAllIcal} onSync={syncAllIcal} lastSyncAt={lastAirbnbSyncAt} />
          <button className="primary" onClick={reset}><Plus size={17} />Crear habitacion</button>
        </div>
      </section>

      <section className="room-kpi-grid">
        <article className="room-kpi-card">
          <span><BedDouble size={25} /></span>
          <div><small>Total habitaciones</small><strong>{props.rooms.length}</strong><em>Sin cambios</em></div>
        </article>
        <article className="room-kpi-card purple">
          <span><RefreshCw size={25} /></span>
          <div><small>iCal activo</small><strong>{airbnbActiveCount} / {props.rooms.length || 0}</strong><em>{props.rooms.length ? Math.round((airbnbActiveCount / props.rooms.length) * 100) : 0}% del total</em></div>
        </article>
      </section>

      <section className="rooms-filter-bar">
        <label className="search-box room-search">
          <Search size={17} />
          <input value={roomQuery} onChange={(event) => setRoomQuery(event.target.value)} placeholder="Buscar habitacion por ID/codigo..." />
        </label>
        <div className="room-filter-chips">
          {([
            ["todas", "Todas"],
            ["disponibles", "Disponibles"],
            ["ocupadas", "Ocupadas"],
            ["limpieza", "Limpieza"],
            ["bloqueadas", "Bloqueadas"],
            ["pendientes", "Pendientes"],
            ["airbnb", "Airbnb activo"]
          ] as [typeof roomStatusFilter, string][]).map(([value, label]) => (
            <button key={value} className={roomStatusFilter === value ? "active" : ""} onClick={() => setRoomStatusFilter(value)}>{label}</button>
          ))}
        </div>
      </section>
      <section className="work-panel room-editor-panel">
        <div className="room-editor-heading">
          <div>
            <h2>{editing ? "Editar habitacion" : "Crear habitacion"}</h2>
            <p>{editing ? `Codigo ${editing.codigo_habitacion}` : "Datos esenciales para publicar la habitacion."}</p>
          </div>
          {editing && <span className={`room-editor-state ${form.estado}`}>{form.estado}</span>}
        </div>
        <div className="form-grid room-core-fields">
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
        </div>
        <details className="room-editor-details">
          <summary>Mas detalles</summary>
          <div className="form-grid room-extra-fields">
            <label>Color<input type="color" value={safeCalendarColor(form.color_calendario)} onChange={(event) => setForm({ ...form, color_calendario: event.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={Boolean(form.pendiente_revision)} onChange={(event) => setForm({ ...form, pendiente_revision: event.target.checked ? 1 : 0 })} />Pendiente de revisar</label>
            <Field label="Foto URL" value={form.foto_url} onChange={(value) => setForm({ ...form, foto_url: value })} />
            <label className="full">Descripcion<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></label>
          </div>
        </details>
        <details className="room-editor-details airbnb-editor-details" open={icalOpen} onToggle={(event) => setIcalOpen(event.currentTarget.open)}>
          <summary>Airbnb iCal <span>{form.airbnb_ical_activo ? "Activo" : "Opcional"}</span></summary>
          <section className="airbnb-ical-section">
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
        </details>
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
              <span className="room-dot" style={{ background: safeCalendarColor(room.color_calendario) }} />
              <div className="room-card-main">
                {room.foto_url ? <img className="room-thumb" src={room.foto_url} alt="" /> : null}
                <div>
                <strong>{room.codigo_habitacion} · {room.nombre_habitacion}</strong>
                <small>{room.tipo_habitacion || "Sin tipo"} · {room.capacidad} pax · {formatRoomPrice(room)} · {future} reservas visibles</small>
                {room.pendiente_revision ? <em>Pendiente de revisar</em> : null}
                </div>
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
  const listingRooms = useMemo(() => props.rooms.filter((room) => String(room.airbnb_listing_id || "").trim()), [props.rooms]);
  const [detailsRoomId, setDetailsRoomId] = useState("");
  const [listingDetails, setListingDetails] = useState<AirbnbListingDetailsResponse | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState("");

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

  useEffect(() => {
    if (!detailsRoomId && listingRooms.length) setDetailsRoomId(String(listingRooms[0].id));
    if (detailsRoomId && !listingRooms.some((room) => String(room.id) === detailsRoomId)) {
      setDetailsRoomId(listingRooms[0] ? String(listingRooms[0].id) : "");
      setListingDetails(null);
    }
  }, [detailsRoomId, listingRooms]);

  const extractListingDetails = async () => {
    if (!detailsRoomId) return;
    setDetailsBusy(true);
    setDetailsError("");
    try {
      setListingDetails(await api.airbnbListingDetails(Number(detailsRoomId), { refresh: "1" }));
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "No se pudo extraer la información del listing Airbnb.");
    } finally {
      setDetailsBusy(false);
    }
  };

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
        <div className="panel-header">
          <div>
            <strong>Información del listing Airbnb</strong>
            <small>Consulta el listing ID que ya está guardado en Habitaciones mediante Airbnb Scraper API.</small>
          </div>
        </div>
        {listingRooms.length === 0 ? (
          <p className="empty-copy">No hay habitaciones con ID listing Airbnb configurado.</p>
        ) : (
          <>
            <div className="form-grid">
              <label className="full">Listing existente
                <select value={detailsRoomId} onChange={(event) => { setDetailsRoomId(event.target.value); setListingDetails(null); setDetailsError(""); }}>
                  {listingRooms.map((room) => <option key={room.id} value={room.id}>{room.codigo_habitacion} - {room.nombre_habitacion} · {room.airbnb_listing_id}</option>)}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary" disabled={detailsBusy || !detailsRoomId} onClick={extractListingDetails}><RefreshCw size={16} />{detailsBusy ? "Extrayendo..." : "Extraer información"}</button>
            </div>
            {detailsError && <div className="notice error">{detailsError}</div>}
            {listingDetails && (() => {
              const listing = listingDetails.listing;
              const pricing = listing.pricing || {};
              const location = listing.location || listing.full_address || listing.city || "Sin ubicación";
              const photos = Array.isArray(listing.photos) ? listing.photos : [];
              return (
                <div className="airbnb-listing-details">
                  <div className="airbnb-listing-heading">
                    <div>
                      <h2>{listing.title || "Listing Airbnb"}</h2>
                      <p>{listing.tagline || listing.property_type || ""}</p>
                      <span>{location}</span>
                    </div>
                    <span className={`airbnb-availability ${listing.is_available === false ? "unavailable" : "available"}`}>
                      {listing.is_available === false ? "No disponible" : "Disponible"}
                    </span>
                  </div>
                  <div className="airbnb-listing-stats">
                    <span><strong>{listing.overall_rating ?? "—"}</strong> rating</span>
                    <span><strong>{listing.review_count ?? "—"}</strong> reseñas</span>
                    <span><strong>{listing.guest_capacity ?? "—"}</strong> huéspedes</span>
                    <span><strong>{formatListingMoney(pricing.nightly_rate ?? pricing.rate, pricing.currency || "USD")}</strong> por noche</span>
                    <span><strong>{listing.host_name || "—"}</strong> anfitrión</span>
                  </div>
                  <div className="airbnb-listing-meta">
                    <span>{listing.bedroom_count ?? "—"} habitaciones</span>
                    <span>{listing.bathroom_count ?? "—"} baños</span>
                    <span>{listing.bed_count ?? "—"} camas</span>
                    <span>{listing.is_superhost ? "Superhost" : "Anfitrión estándar"}</span>
                    <span>{listing.is_guest_favorite ? "Favorito de huéspedes" : ""}</span>
                    {pricing.total != null && <span>Total mostrado: {formatListingMoney(pricing.total, pricing.currency || "USD")}</span>}
                  </div>
                  {listing.highlights?.length ? <p className="airbnb-listing-highlights"><strong>Destacados:</strong> {listing.highlights.join(" · ")}</p> : null}
                  {photos.length > 0 && <div className="airbnb-listing-photos">{photos.slice(0, 5).map((photo) => <img key={photo} src={photo} alt="Foto del listing Airbnb" />)}</div>}
                  <div className="airbnb-listing-footer">
                    <span>Extraído: {listingDetails.fetched_at}{listingDetails.cached ? " · cache local" : ""}</span>
                    {listing.listing_url && <a href={listing.listing_url} target="_blank" rel="noreferrer">Abrir en Airbnb</a>}
                  </div>
                </div>
              );
            })()}
          </>
        )}
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

  const airbnbReservationId = (reservation: Reservation) => {
    const remision = (reservation.numero_remision || "").trim();
    return remision.replace(/^AIRBNB[-\s]*/i, "") || `Reserva ${reservation.id}`;
  };

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
            <h1>Reservas Airbnb</h1>
            <small>Listado separado para revisar huespedes, fechas, pagos y codigos Airbnb.</small>
          </div>
        </div>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <label className="search-box">
          <Search size={17} />
          <input aria-label="Buscar reserva Airbnb" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre, codigo, telefono o habitacion..." />
        </label>
        {filtered.length === 0 && <p className="empty-copy">No hay reservas Airbnb para mostrar.</p>}
        <div className="airbnb-name-list">
          {filtered.map((reservation) => (
            <div className="airbnb-name-row" key={reservation.id}>
              <button className="reservation-card compact-card" onClick={() => props.onSelect(reservation)}>
                <strong>{isAirbnbPlaceholderName(reservation.nombre_completo_huesped) ? "Huesped pendiente" : reservation.nombre_completo_huesped}</strong>
                <span className="airbnb-reservation-id">ID Airbnb: {airbnbReservationId(reservation)}</span>
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
  const [backups, setBackups] = useState<{ id: number; kind: string; status: string; file_name: string; size_bytes: number; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshBackups = async () => {
    const result = await api.backups();
    setBackups(result.items);
  };

  useEffect(() => { void refreshBackups().catch(() => undefined); }, []);

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
      const result = await api.importRoomsConfirm(roomPreview.sessionId);
      setMessage(`Habitaciones actualizadas. Creadas: ${result.habitaciones_creadas}. Actualizadas: ${result.habitaciones_actualizadas}. Alertas: ${result.cantidad_alertas}.`);
      setRoomPreview(null);
      await refreshBackups();
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

  const generateBackup = async () => {
    setBusy(true);
    setError("");
    try {
      const backup = await api.createBackup("manual");
      setMessage(`Backup validado: ${backup.file_name}`);
      await refreshBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el backup.");
    } finally {
      setBusy(false);
    }
  };

  const unmappedListings = useMemo(() => {
    if (!airbnbPreview) return [];
    if (airbnbPreview.unmappedListings?.length) return airbnbPreview.unmappedListings;
    return Array.from(new Set(
      airbnbPreview.rows
        .map((row) => String(row.data.anuncio || "").trim())
        .filter((listing) => listing && !airbnbPreview.rows.find((row) => String(row.data.anuncio || "").trim() === listing && String(row.data.habitacion || "").trim()))
    ));
  }, [airbnbPreview]);
  const missingListingMappings = unmappedListings.filter((listing) => !listingMappings[listing]);

  return (
    <section className="import-page">
      <section className="dashboard-hero">
        <div>
          <span className="desktop-copy">Cargues, descargas y guias</span>
          <span className="mobile-copy">Sube archivos y descarga respaldos</span>
          <h1><span className="desktop-copy">Centro de importaciones y respaldos</span><span className="mobile-copy">Importaciones</span></h1>
        </div>
      </section>
      {busy && <div className="notice">Procesando archivo...</div>}
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      <details className="work-panel import-section" open>
        <summary>Respaldos seguros</summary>
        <div className="template-download">
          <div>
            <strong>Backup técnico completo</strong>
            <span>Genera una snapshot consistente de SQLite, manifiesto, hash SHA-256 y adjuntos antes de operaciones críticas.</span>
          </div>
          <button className="primary" disabled={busy} onClick={generateBackup}><Download size={17} />Generar backup ahora</button>
        </div>
        <div className="preview-table">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Tamaño</th><th>Estado</th></tr></thead>
            <tbody>{backups.slice(0, 10).map((backup) => <tr key={backup.id}>
              <td>{backup.created_at}</td><td>{backup.kind}</td><td>{backup.file_name}</td><td>{Math.ceil(backup.size_bytes / 1024)} KB</td><td>{backup.status}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>

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
              <span>Modo seguro: se importa todo de forma atómica; una alerta bloqueante no modifica la base.</span>
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
        <summary>Importar Airbnb: próximas reservas e histórico</summary>
        <div className="template-download">
          <div>
            <strong>Detector de perfiles Airbnb</strong>
            <span>Reconoce próximas reservas e histórico/facturación por estructura. Los payouts y ajustes de resolución se ignoran; no se asignan habitaciones por similitud.</span>
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
                <h2>{airbnbPreview.profile === "AIRBNB_PENDING" ? "Próximas reservas de Airbnb" : airbnbPreview.profile === "AIRBNB_HISTORY" ? "Histórico y facturación de Airbnb" : "Archivo Airbnb ambiguo"}</h2>
                <p>{airbnbPreview.nombre_archivo} - {airbnbPreview.filas} filas - {airbnbPreview.createCount} nuevas - {airbnbPreview.updateCount} para actualizar - {airbnbPreview.alertCount} alertas</p>
              </div>
              <button className="primary" disabled={busy || missingListingMappings.length > 0 || (airbnbPreview.canImportCount === 0 && !Object.values(listingMappings).some(Boolean))} onClick={confirmAirbnbImport}><Upload size={17} />Confirmar cargue Airbnb</button>
            </div>
            {unmappedListings.length > 0 && (
              <div>
                <p className="notice">Airbnb repite algunos nombres de anuncio. Selecciona la habitación correcta una sola vez y confirma el cargue: el sistema guardará esa elección para los próximos archivos. Si el archivo incluye <strong>Listing ID</strong>, la asociación se realiza automáticamente.</p>
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
