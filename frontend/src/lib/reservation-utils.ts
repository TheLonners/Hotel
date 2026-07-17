import { today } from "./hotel-utils";
import type { Reservation } from "../services/types";

export function reservationCode(reservation: Pick<Reservation, "id" | "numero_interno" | "fecha_creacion">) {
  if (reservation.numero_interno) return reservation.numero_interno;
  const year = String(reservation.fecha_creacion || today).slice(0, 4) || String(new Date().getFullYear());
  return `VM-${year}-${String(reservation.id).padStart(6, "0")}`;
}

export function extractAirbnbReservationUrl(notes: string) {
  const match = String(notes || "").match(/https?:\/\/(?:www\.)?airbnb\.com\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;]+$/, "") || "";
}

function slugText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "huesped";
}

export function renameReceiptFile(file: File, guestName: string) {
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return new File([file], `comprobante-${slugText(guestName)}-${timestamp}${extension}`, { type: file.type });
}
