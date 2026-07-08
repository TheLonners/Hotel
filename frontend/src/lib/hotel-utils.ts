import type { Reservation, Room } from "../services/types";

export const today = new Date().toISOString().slice(0, 10);
export const currentMonth = today.slice(0, 7);

export function formatMoney(value: number | string | undefined) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(numeric);
}

export function formatRoomPrice(room: Room) {
  return room.estado === "inactiva" ? "Deshabilitada" : formatMoney(room.precio_base_noche);
}

export function formatPercent(value: number | string | undefined) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, amount: number) {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return toISO(parsed);
}

export function diffDays(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

export function effectiveEnd(start: string, end: string) {
  return diffDays(start, end) <= 0 ? addDays(start, 1) : end;
}

export function calendarRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = toISO(new Date(Date.UTC(year, monthNumber - 1, 1)));
  const rangeStart = month === currentMonth ? addDays(today, -1) : addDays(firstDay, -45);
  return {
    start: rangeStart,
    end: addDays(firstDay, 120)
  };
}

export function calendarDays(month: string) {
  const range = calendarRange(month);
  const days: string[] = [];
  for (let cursor = parseDate(range.start); cursor < parseDate(range.end); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(toISO(cursor));
  }
  return days;
}

export function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return toISO(new Date(Date.UTC(year, monthNumber - 1 + amount, 1))).slice(0, 7);
}

export function paymentClass(status: string) {
  if (status === "pagado_total") return "paid";
  if (status === "sin_pago") return "unpaid";
  if (status === "saldo_pendiente" || status === "abono_parcial") return "balance";
  return "confirmed";
}

export function roomLabel(reservation: Reservation) {
  return reservation.rooms.map((room) => room.codigo_habitacion).join(" Y ");
}

export function isAirbnbPlaceholderName(name: string) {
  return /^Airbnb( |$)/i.test(String(name || "").trim());
}

export function reservationParams(month: string, search: string, filters: Record<string, string>) {
  const { start, end } = calendarRange(month);
  const params: Record<string, string> = { start, end };
  if (search.trim()) params.q = search.trim();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  return params;
}
