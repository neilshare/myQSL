import type { RadioEventKind } from "@myqsl/domain";
import { BinaryPacketError, BinaryReader } from "./binary-reader";

const MAGIC = 0xadbccbda;

export type WsjtxPacket = {
  source: "wsjtx";
  kind: "qso_logged" | "heartbeat" | "ignored";
  schema: number;
  id: string;
  sourceRecordId: string;
  eventKind: RadioEventKind | null;
  qso?: {
    call: string;
    gridsquare: string | null;
    freq_hz: number;
    mode: string;
    rst_sent: string;
    rst_rcvd: string;
    comment: string;
    name: string;
    qso_date: string;
    time_on: string;
    operator_callsign: string;
    station_callsign: string;
    my_grid: string | null;
    adif_extra: Record<string, string>;
  };
};

function adifDate(date: Date): string { return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`; }
function adifTime(date: Date): string { return `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}`; }

export function decodeWsjtx(bytes: Uint8Array): WsjtxPacket {
  if (bytes.byteLength > 64 * 1024) throw new BinaryPacketError("WSJT-X packet exceeds 64 KiB");
  const reader = new BinaryReader(bytes);
  if (reader.u32() !== MAGIC) throw new BinaryPacketError("Invalid WSJT-X magic number");
  const schema = reader.u32();
  if (schema < 2 || schema > 3) throw new BinaryPacketError(`Unsupported WSJT-X schema ${schema}`);
  const type = reader.u32();
  const id = reader.utf8();
  if (!id) throw new BinaryPacketError("WSJT-X id is missing");
  if (type === 0) return { source: "wsjtx", kind: "heartbeat", schema, id, sourceRecordId: id, eventKind: null };
  if (type !== 5 && type !== 12) return { source: "wsjtx", kind: "ignored", schema, id, sourceRecordId: id, eventKind: null };
  if (type === 12) {
    const adif = reader.utf8();
    if (!adif || !/<EOR\s*>/iu.test(adif)) throw new BinaryPacketError("WSJT-X Logged ADIF is missing EOR");
    return { source: "wsjtx", kind: "qso_logged", schema, id, sourceRecordId: id, eventKind: "qso_logged", qso: parseAdifPayload(adif, id) };
  }
  if (schema < 3) throw new BinaryPacketError("WSJT-X QSOLogged requires schema 3 in this implementation");
  const dateOff = reader.qDateTime();
  const call = reader.utf8();
  const grid = reader.utf8();
  const frequency = reader.u64();
  const mode = reader.utf8();
  const rstSent = reader.utf8();
  const rstRcvd = reader.utf8();
  const power = reader.utf8();
  const comment = reader.utf8();
  const name = reader.utf8();
  const dateOn = reader.qDateTime();
  const operator = reader.utf8();
  const myCall = reader.utf8();
  const myGrid = reader.utf8();
  const exchangeSent = reader.utf8();
  const exchangeReceived = reader.utf8();
  const propagation = reader.utf8();
  if (!call || !mode || !myCall) throw new BinaryPacketError("WSJT-X QSOLogged missing callsign or mode");
  return {
    source: "wsjtx", kind: "qso_logged", schema, id, sourceRecordId: id, eventKind: "qso_logged",
    qso: {
      call, gridsquare: grid, freq_hz: Number(frequency), mode, rst_sent: rstSent ?? "", rst_rcvd: rstRcvd ?? "", comment: comment ?? "", name: name ?? "",
      qso_date: adifDate(dateOn), time_on: adifTime(dateOn), operator_callsign: operator ?? "", station_callsign: myCall, my_grid: myGrid,
      adif_extra: { WSJTX_DATE_OFF: dateOff.toISOString(), WSJTX_POWER: power ?? "", WSJTX_EXCHANGE_SENT: exchangeSent ?? "", WSJTX_EXCHANGE_RECEIVED: exchangeReceived ?? "", WSJTX_PROPAGATION: propagation ?? "" }
    }
  };
}

function parseAdifPayload(text: string, sourceId: string): WsjtxPacket["qso"] {
  const fields: Record<string, string> = {};
  for (const match of text.matchAll(/<([A-Z0-9_]+)(?::\d+)?(?:\s+[^>]*)?>([^<]*)/giu)) fields[match[1].toUpperCase()] = match[2].trim();
  const date = fields.QSO_DATE;
  const time = fields.TIME_ON;
  if (!fields.CALL || !fields.MODE || !fields.MY_CALL || !date || !time || !/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) throw new BinaryPacketError(`Invalid WSJT-X ADIF payload ${sourceId}`);
  const known = new Set(["CALL", "DXCC", "GRIDSQUARE", "FREQ", "MODE", "RST_SENT", "RST_RCVD", "COMMENT", "NAME", "QSO_DATE", "TIME_ON", "OPERATOR", "MY_CALL", "MY_GRIDSQUARE"]);
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) if (!known.has(key)) extra[key] = value;
  return { call: fields.CALL, gridsquare: fields.GRIDSQUARE ?? null, freq_hz: fields.FREQ ? Math.round(Number(fields.FREQ) * 1_000_000) : 0, mode: fields.MODE, rst_sent: fields.RST_SENT ?? "", rst_rcvd: fields.RST_RCVD ?? "", comment: fields.COMMENT ?? "", name: fields.NAME ?? "", qso_date: date, time_on: time, operator_callsign: fields.OPERATOR ?? "", station_callsign: fields.MY_CALL, my_grid: fields.MY_GRIDSQUARE ?? null, adif_extra: extra };
}
