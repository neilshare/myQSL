export interface DedupeKeyFields {
  station_callsign: string;
  call: string;
  qso_date: string;
  time_on: string;
  band: string;
  mode: string;
  submode?: string | null;
}

export async function makeDedupeKey(qso: DedupeKeyFields): Promise<string> {
  const canonical = [
    qso.station_callsign,
    qso.call,
    qso.qso_date,
    qso.time_on,
    qso.band.toUpperCase(),
    qso.mode.toUpperCase(),
    qso.submode?.toUpperCase() ?? ""
  ].join("|");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface SoftDuplicateFields {
  station_callsign: string;
  call: string;
  qso_date: string;
  time_on: string;
  band: string;
  mode: string;
}

export function parseQsoTimestamp(qso_date: string, time_on: string): number {
  if (!/^\d{8}$/.test(qso_date) || !/^\d{4,6}$/.test(time_on)) {
    return NaN;
  }
  const year = parseInt(qso_date.slice(0, 4), 10);
  const month = parseInt(qso_date.slice(4, 6), 10) - 1;
  const day = parseInt(qso_date.slice(6, 8), 10);
  const hours = parseInt(time_on.slice(0, 2), 10);
  const minutes = parseInt(time_on.slice(2, 4), 10);
  const seconds = time_on.length >= 6 ? parseInt(time_on.slice(4, 6), 10) : 0;
  return Date.UTC(year, month, day, hours, minutes, seconds);
}

export function isSoftDuplicate(a: SoftDuplicateFields, b: SoftDuplicateFields, windowMs = 180_000): boolean {
  if (
    a.call.trim().toUpperCase() !== b.call.trim().toUpperCase() ||
    a.station_callsign.trim().toUpperCase() !== b.station_callsign.trim().toUpperCase() ||
    a.band.trim().toUpperCase() !== b.band.trim().toUpperCase() ||
    a.mode.trim().toUpperCase() !== b.mode.trim().toUpperCase()
  ) {
    return false;
  }
  const tsA = parseQsoTimestamp(a.qso_date, a.time_on);
  const tsB = parseQsoTimestamp(b.qso_date, b.time_on);
  if (Number.isNaN(tsA) || Number.isNaN(tsB)) {
    return false;
  }
  return Math.abs(tsA - tsB) <= windowMs;
}
