const { db } = require("../database/db");
const { getRoomById } = require("./reservations");

const API_BASE_URL = String(process.env.AIRBNB_SCRAPER_API_URL || "https://airbnb-scraper-api.omkar.cloud")
  .replace(/\/+$/, "");

function cleanText(value) {
  return String(value ?? "").trim();
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function optionalDate(value, fieldName) {
  const text = cleanText(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw httpError(`${fieldName} debe usar el formato YYYY-MM-DD.`);
  }
  return text;
}

function requestParams(input = {}) {
  const arrivalDate = optionalDate(input.arrival_date, "La fecha de llegada");
  const departureDate = optionalDate(input.departure_date, "La fecha de salida");
  if (Boolean(arrivalDate) !== Boolean(departureDate)) {
    throw httpError("Para consultar precio por fechas debes enviar llegada y salida.");
  }

  const adultGuests = input.adult_guests === undefined || input.adult_guests === ""
    ? ""
    : Number.parseInt(input.adult_guests, 10);
  if (adultGuests !== "" && (!Number.isInteger(adultGuests) || adultGuests < 1 || adultGuests > 50)) {
    throw httpError("La cantidad de adultos debe estar entre 1 y 50.");
  }

  const currencyCode = cleanText(input.currency_code || process.env.AIRBNB_SCRAPER_CURRENCY || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw httpError("La moneda debe ser un código de 3 letras.");

  return {
    arrival_date: arrivalDate,
    departure_date: departureDate,
    adult_guests: adultGuests === "" ? "" : String(adultGuests),
    currency_code: currencyCode
  };
}

function readCached(room) {
  const row = db.prepare(`
    SELECT listing_id, data_json, fetched_at, last_error
    FROM airbnb_listing_details
    WHERE room_id = ?
  `).get(room.id);
  if (!row) return null;
  let listing = {};
  try {
    listing = JSON.parse(row.data_json || "{}");
  } catch (_error) {
    listing = {};
  }
  return {
    room: {
      id: room.id,
      codigo_habitacion: room.codigo_habitacion,
      nombre_habitacion: room.nombre_habitacion,
      airbnb_listing_id: room.airbnb_listing_id
    },
    listing,
    fetched_at: row.fetched_at || "",
    last_error: row.last_error || "",
    cached: true,
    source: "cache"
  };
}

function saveDetails(room, listing) {
  const dataJson = JSON.stringify(listing);
  db.prepare(`
    INSERT INTO airbnb_listing_details (room_id, listing_id, data_json, fetched_at, last_error, fecha_actualizacion)
    VALUES (?, ?, ?, datetime('now'), '', datetime('now'))
    ON CONFLICT(room_id) DO UPDATE SET
      listing_id = excluded.listing_id,
      data_json = excluded.data_json,
      fetched_at = excluded.fetched_at,
      last_error = '',
      fecha_actualizacion = excluded.fecha_actualizacion
  `).run(room.id, cleanText(listing.listing_id || room.airbnb_listing_id), dataJson);
}

async function fetchListingDetails(room, input = {}) {
  const apiKey = cleanText(process.env.AIRBNB_SCRAPER_API_KEY);
  if (!apiKey) {
    throw httpError("Falta AIRBNB_SCRAPER_API_KEY en backend/.env. Créala en omkar.cloud para consultar los datos.", 503);
  }

  const listingId = cleanText(room.airbnb_listing_id);
  if (!listingId) throw httpError("La habitación no tiene un ID listing Airbnb configurado.");

  const params = requestParams(input);
  Object.keys(params).forEach((key) => {
    if (params[key] === "") delete params[key];
  });
  params.stay_id = listingId;
  const url = `${API_BASE_URL}/airbnb/listings/details?${new URLSearchParams(params).toString()}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "API-Key": apiKey,
        "Accept": "application/json",
        "User-Agent": "Hotel-Reservas-Local/1.0"
      }
    });
  } catch (error) {
    throw httpError(`No se pudo conectar con Airbnb Scraper API: ${error.message}`, 502);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = cleanText(payload.detail || payload.message || payload.error);
    if (response.status === 401) throw httpError("La API Key de Airbnb Scraper no es válida.", 502);
    if (response.status === 429) throw httpError("Airbnb Scraper alcanzó el límite mensual de solicitudes.", 429);
    throw httpError(`Airbnb Scraper respondió ${response.status}${providerMessage ? `: ${providerMessage}` : "."}`, 502);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError("Airbnb Scraper devolvió una respuesta no válida.", 502);
  }
  saveDetails(room, payload);
  return {
    room: {
      id: room.id,
      codigo_habitacion: room.codigo_habitacion,
      nombre_habitacion: room.nombre_habitacion,
      airbnb_listing_id: room.airbnb_listing_id
    },
    listing: payload,
    fetched_at: new Date().toISOString(),
    last_error: "",
    cached: false,
    source: "omkarcloud"
  };
}

async function getAirbnbListingDetails(roomId, input = {}) {
  const room = getRoomById(Number(roomId));
  if (!room) throw httpError("Habitación no encontrada.", 404);

  const cached = readCached(room);
  const refresh = String(input.refresh || "").toLowerCase() === "1" || String(input.refresh || "").toLowerCase() === "true";
  const hasDatePricing = cleanText(input.arrival_date) || cleanText(input.departure_date);
  if (cached && !refresh && !hasDatePricing) return cached;
  return fetchListingDetails(room, input);
}

module.exports = { getAirbnbListingDetails };
