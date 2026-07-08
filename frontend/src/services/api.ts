import type { AirbnbFeed, Attachment, BillingAccount, Block, CleaningReport, Dashboard, Payment, Reservation, Room, TodayOperations } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const password = localStorage.getItem("hotel_admin_password");
  if (password) headers.set("x-admin-password", password);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "La solicitud no pudo completarse.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  rooms: () => request<Room[]>("/api/rooms"),
  createRoom: (body: Partial<Room>) => request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  updateRoom: (id: number, body: Partial<Room>) => request<Room>(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  testRoomAirbnbIcal: (id: number, body: Record<string, unknown>) =>
    request<{ ok: boolean; events: number; message: string; room: Room }>(`/api/rooms/${id}/airbnb-ical/test`, { method: "POST", body: JSON.stringify(body) }),
  deleteRoom: (id: number) => request<{ ok: boolean }>(`/api/rooms/${id}`, { method: "DELETE" }),

  reservations: (params: Record<string, string> = {}) => request<Reservation[]>(`/api/reservations?${new URLSearchParams(params)}`),
  reservation: (id: number) => request<Reservation>(`/api/reservations/${id}`),
  createReservation: (body: Record<string, unknown>) => request<Reservation>("/api/reservations", { method: "POST", body: JSON.stringify(body) }),
  updateReservation: (id: number, body: Record<string, unknown>) => request<Reservation>(`/api/reservations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteReservation: (id: number) => request<{ ok: boolean }>(`/api/reservations/${id}`, { method: "DELETE" }),

  blocks: () => request<Block[]>("/api/blocks"),
  createBlock: (body: Record<string, unknown>) => request<Block>("/api/blocks", { method: "POST", body: JSON.stringify(body) }),
  updateBlock: (id: number, body: Record<string, unknown>) => request<Block>(`/api/blocks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteBlock: (id: number) => request<{ ok: boolean }>(`/api/blocks/${id}`, { method: "DELETE" }),

  availability: (params: Record<string, string>) => request<Room[]>(`/api/availability?${new URLSearchParams(params)}`),

  airbnbFeeds: () => request<AirbnbFeed[]>("/api/airbnb-sync/feeds"),
  createAirbnbFeed: (body: Record<string, unknown>) => request<AirbnbFeed>("/api/airbnb-sync/feeds", { method: "POST", body: JSON.stringify(body) }),
  updateAirbnbFeed: (id: number, body: Record<string, unknown>) => request<AirbnbFeed>(`/api/airbnb-sync/feeds/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAirbnbFeed: (id: number) => request<{ ok: boolean }>(`/api/airbnb-sync/feeds/${id}`, { method: "DELETE" }),
  syncAirbnbFeed: (id: number) => request<Record<string, unknown>>(`/api/airbnb-sync/feeds/${id}/sync`, { method: "POST" }),
  previewAirbnbImport: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Record<string, unknown>>("/api/airbnb-sync/import-preview", { method: "POST", body: form });
  },
  importAirbnbNames: (file: File, listingMappings: Record<string, string | number> = {}) => {
    const form = new FormData();
    form.append("file", file);
    form.append("listingMappings", JSON.stringify(listingMappings));
    return request<Record<string, unknown>>("/api/airbnb-sync/import-names", { method: "POST", body: form });
  },

  createPayment: (reservationId: number, body: Record<string, unknown>) =>
    request<{ payment: Payment; reservation: Reservation }>(`/api/reservations/${reservationId}/payments`, { method: "POST", body: JSON.stringify(body) }),
  deletePayment: (id: number) => request<{ ok: boolean }>(`/api/payments/${id}`, { method: "DELETE" }),

  uploadAttachment: (reservationId: number, form: FormData) =>
    request<Attachment>(`/api/reservations/${reservationId}/attachments`, { method: "POST", body: form }),
  deleteAttachment: (id: number) => request<{ ok: boolean }>(`/api/attachments/${id}`, { method: "DELETE" }),

  dashboard: (params: Record<string, string> = {}) => request<Dashboard>(`/api/dashboard?${new URLSearchParams(params)}`),
  today: (params: Record<string, string> = {}) => request<TodayOperations>(`/api/today?${new URLSearchParams(params)}`),
  cleaning: (params: Record<string, string> = {}) => request<CleaningReport>(`/api/cleaning?${new URLSearchParams(params)}`),
  updateCleaning: (roomId: number, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/cleaning/${roomId}`, { method: "PUT", body: JSON.stringify(body) }),
  billingAccount: (params: Record<string, string> = {}) => request<BillingAccount>(`/api/billing-account?${new URLSearchParams(params)}`),

  importPreview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportPreview>("/api/import/excel/preview", { method: "POST", body: form });
  },
  importConfirm: (sessionId: string, force = false) =>
    request<Record<string, unknown>>("/api/import/excel/confirm", { method: "POST", body: JSON.stringify({ sessionId, force }) }),
  importRoomsPreview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<RoomImportPreview>("/api/import/rooms/preview", { method: "POST", body: form });
  },
  importRoomsConfirm: (sessionId: string, force = false) =>
    request<Record<string, unknown>>("/api/import/rooms/confirm", { method: "POST", body: JSON.stringify({ sessionId, force }) }),

  downloadFile: async (path: string, filename: string) => {
    const headers = new Headers();
    const password = localStorage.getItem("hotel_admin_password");
    if (password) headers.set("x-admin-password", password);

    const response = await fetch(`${API_BASE}${path}`, { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se pudo descargar el archivo.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  downloadPost: async (path: string, body: Record<string, unknown>, filename: string) => {
    const headers = new Headers();
    const password = localStorage.getItem("hotel_admin_password");
    if (password) headers.set("x-admin-password", password);
    headers.set("Content-Type", "application/json");

    const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se pudo descargar el archivo.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
};

export interface ImportPreview {
  sessionId: string;
  fileName: string;
  sheetName: string;
  columns: string[];
  rows: {
    rowNumber: number;
    data: Record<string, unknown>;
    alerts: { tipo_alerta: string; mensaje: string; severidad: string }[];
    canImport: boolean;
  }[];
  totalRows: number;
  alerts: { tipo_alerta: string; mensaje: string; severidad: string }[];
  canImportCount: number;
}

export interface RoomImportPreview {
  sessionId: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  columns: string[];
  rows: {
    rowNumber: number;
    action: "crear" | "actualizar";
    data: Record<string, unknown>;
    alerts: { tipo_alerta: string; mensaje: string; severidad: string }[];
    canImport: boolean;
  }[];
  totalRows: number;
  alerts: { tipo_alerta: string; mensaje: string; severidad: string }[];
  canImportCount: number;
  createCount: number;
  updateCount: number;
}
