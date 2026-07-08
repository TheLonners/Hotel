function pad(value) {
  return String(value).padStart(2, "0");
}

function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseISODate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function excelSerialToISO(serial) {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) return "";
  const millis = Math.round((numeric - 25569) * 86400 * 1000);
  return toISODate(new Date(millis));
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return toISODate(value);

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToISO(value);
  }

  const text = String(value).trim();
  if (!text) return "";

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    const [year, month, day] = text.split(/[ T]/)[0].split("-").map(Number);
    return toISODate(new Date(Date.UTC(year, month - 1, day)));
  }

  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 20000) {
    return excelSerialToISO(Number(text));
  }

  const parts = text.split(/[\/\-.]/).map((part) => part.trim());
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    let [day, month, year] = parts.map(Number);
    if (parts[0].length === 4) {
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
    }
    if (year < 100) year += 2000;
    return toISODate(new Date(Date.UTC(year, month - 1, day)));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return toISODate(new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())));
  }

  return "";
}

function addDays(isoDate, amount) {
  const date = parseISODate(isoDate);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return toISODate(date);
}

function diffNights(checkIn, checkOut) {
  const start = parseISODate(checkIn);
  const end = parseISODate(checkOut);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function compareDates(a, b) {
  const first = parseISODate(a);
  const second = parseISODate(b);
  if (!first || !second) return 0;
  return first.getTime() - second.getTime();
}

function effectiveCheckOut(checkIn, checkOut) {
  if (!checkIn) return "";
  if (!checkOut || compareDates(checkOut, checkIn) <= 0) return addDays(checkIn, 1);
  return checkOut;
}

function rangesOverlap(startA, endA, startB, endB) {
  const aStart = parseISODate(startA);
  const aEnd = parseISODate(endA);
  const bStart = parseISODate(startB);
  const bEnd = parseISODate(endB);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

module.exports = {
  addDays,
  compareDates,
  diffNights,
  effectiveCheckOut,
  excelSerialToISO,
  parseDateValue,
  rangesOverlap,
  toISODate
};
