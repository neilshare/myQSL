import { XMLParser } from "fast-xml-parser";
import type { RadioEventKind } from "@myqsl/domain";

export type N1mmPacket = { source: "n1mm"; kind: "qso_logged" | "external_replace" | "external_delete" | "ignored"; eventKind: RadioEventKind | null; sourceRecordId: string | null; sourceInstance: string | null; qso?: { call: string; station_callsign: string; qso_date: string; time_on: string; band: string; mode: string; freq_mhz: string | null; rst_sent: string | null; rst_rcvd: string | null; name: string | null; qth: string | null; comment: string | null; adif_extra: Record<string, string> } };

const parser = new XMLParser({ processEntities: false, htmlEntities: false, ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true, isArray: () => false });
const value = (record: Record<string, unknown>, key: string): string => typeof record[key] === "string" || typeof record[key] === "number" ? String(record[key]) : "";

function strictDateTime(input: string): { date: string; time: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(input.trim());
  if (!match) throw new Error("Invalid N1MM timestamp");
  const date = `${match[1]}${match[2]}${match[3]}`;
  const time = `${match[4]}${match[5]}${match[6]}`;
  const parsed = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  const check = new Date(parsed);
  if (check.getUTCFullYear() !== Number(match[1]) || check.getUTCMonth() !== Number(match[2]) - 1 || check.getUTCDate() !== Number(match[3]) || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) throw new Error("Invalid N1MM calendar value");
  return { date, time };
}

function bandToAdif(raw: string): string {
  const value = raw.replace(",", ".");
  const mhz = Number(value);
  if (mhz === 1.8) return "160M"; if (mhz === 3.5) return "80M"; if (mhz === 7) return "40M"; if (mhz === 14) return "20M"; if (mhz === 21) return "15M"; if (mhz === 28) return "10M"; if (mhz === 50) return "6M"; if (mhz === 144) return "2M"; if (mhz === 430) return "70CM"; throw new Error(`Unsupported N1MM band ${raw}`);
}

export function decodeN1mm(xmlBytes: Uint8Array): N1mmPacket {
  if (xmlBytes.byteLength > 64 * 1024) throw new Error("N1MM packet exceeds 64 KiB");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
  if (/<(?:!DOCTYPE|!ENTITY)/iu.test(xml)) throw new Error("N1MM XML entities are not accepted");
  enforceXmlBudget(xml);
  const root = parser.parse(xml) as Record<string, unknown>;
  const rootName = Object.keys(root)[0];
  if (!rootName || !["contactinfo", "contactreplace", "contactdelete", "appinfo", "radioinfo", "lookupinfo", "spot", "score"].includes(rootName.toLowerCase())) return { source: "n1mm", kind: "ignored", eventKind: null, sourceRecordId: null, sourceInstance: null };
  const record = (root[rootName] ?? {}) as Record<string, unknown>;
  const sourceInstance = value(record, "ID") || value(record, "StationName") || null;
  if (rootName.toLowerCase() === "contactdelete") return { source: "n1mm", kind: "external_delete", eventKind: "external_delete", sourceRecordId: sourceInstance, sourceInstance };
  if (rootName.toLowerCase() !== "contactinfo" && rootName.toLowerCase() !== "contactreplace") return { source: "n1mm", kind: "ignored", eventKind: null, sourceRecordId: sourceInstance, sourceInstance };
  const timestamp = strictDateTime(value(record, "timestamp"));
  const modeRaw = value(record, "mode").toUpperCase();
  const mode = modeRaw === "USB" || modeRaw === "LSB" ? "SSB" : modeRaw;
  const freq10Hz = value(record, "txfreq") || value(record, "rxfreq");
  const freqHz = freq10Hz ? Number(freq10Hz) * 10 : NaN;
  if (!Number.isSafeInteger(freqHz) || freqHz <= 0) throw new Error("Invalid N1MM frequency");
  const known = new Set(["app", "contestname", "contestnr", "timestamp", "mycall", "band", "rxfreq", "txfreq", "operator", "mode", "call", "snt", "rcv", "gridsquare", "qth", "name", "comment", "ID", "StationName"]);
  const extras: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) if (!known.has(key) && (typeof raw === "string" || typeof raw === "number")) extras[`N1MM_${key.toUpperCase()}`] = String(raw);
  return { source: "n1mm", kind: rootName.toLowerCase() === "contactreplace" ? "external_replace" : "qso_logged", eventKind: rootName.toLowerCase() === "contactreplace" ? "external_replace" : "qso_logged", sourceRecordId: sourceInstance, sourceInstance, qso: { call: value(record, "call"), station_callsign: value(record, "mycall"), qso_date: timestamp.date, time_on: timestamp.time, band: bandToAdif(value(record, "band")), mode, freq_mhz: (freqHz / 1_000_000).toFixed(6), rst_sent: value(record, "snt") || null, rst_rcvd: value(record, "rcv") || null, name: value(record, "name") || null, qth: value(record, "qth") || null, comment: value(record, "comment") || null, adif_extra: extras } };
}

function enforceXmlBudget(xml: string): void {
  let depth = 0;
  let elements = 0;
  const tags = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\s*\/?>/gu;
  for (const match of xml.matchAll(tags)) {
    const raw = match[0];
    if (raw.startsWith("<?") || raw.startsWith("<!")) continue;
    const closing = raw.startsWith("</");
    const selfClosing = /\/\s*>$/u.test(raw);
    if (closing) {
      depth -= 1;
      if (depth < 0) throw new Error("Malformed N1MM XML nesting");
    } else {
      elements += 1;
      if (elements > 1000) throw new Error("N1MM XML element limit exceeded");
      depth += 1;
      if (depth > 32) throw new Error("N1MM XML nesting limit exceeded");
      if (selfClosing) depth -= 1;
    }
  }
  if (depth !== 0) throw new Error("Malformed N1MM XML nesting");
}
