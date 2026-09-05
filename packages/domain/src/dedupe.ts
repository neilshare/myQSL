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
