import { z } from "zod";

const Call = z
  .string()
  .trim()
  .min(3)
  .max(16)
  .regex(/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/i);

export const QsoInputSchema = z.object({
  station_id: z.number().int().positive().optional(),
  station_callsign: Call,
  call: Call,
  qso_date: z.string().regex(/^\d{8}$/),
  time_on: z.string().regex(/^\d{4}(?:\d{2})?$/),
  band: z.string().trim().min(1).max(10),
  mode: z.string().trim().min(1).max(16),
  submode: z.string().trim().max(16).nullable().default(null),
  freq_mhz: z.string().regex(/^\d{1,5}(?:\.\d{1,6})?$/).nullable().default(null),
  rst_sent: z.string().trim().max(8).nullable().default(null),
  rst_rcvd: z.string().trim().max(8).nullable().default(null),
  gridsquare: z.string().trim().max(8).nullable().default(null),
  name: z.string().trim().max(80).nullable().default(null),
  qth: z.string().trim().max(160).nullable().default(null),
  comment: z.string().max(2000).nullable().default(null),
  adif_extra: z.record(z.string(), z.string()).default({})
});

export type QsoInput = z.input<typeof QsoInputSchema>;
export type QsoRecord = z.output<typeof QsoInputSchema>;
export type NormalizedQso = QsoRecord & { time_on: string; freq_hz: number | null };

export function normalizeQso(input: QsoInput): NormalizedQso {
  const parsed = QsoInputSchema.parse(input);
  const time_on = parsed.time_on.length === 4 ? `${parsed.time_on}00` : parsed.time_on;
  const freq_hz = parsed.freq_mhz === null ? null : Math.round(Number(parsed.freq_mhz) * 1_000_000);

  return {
    ...parsed,
    station_callsign: parsed.station_callsign.trim().toUpperCase(),
    call: parsed.call.trim().toUpperCase(),
    band: parsed.band.trim().toUpperCase(),
    mode: parsed.mode.trim().toUpperCase(),
    submode: parsed.submode?.trim().toUpperCase() ?? null,
    time_on,
    freq_hz,
    adif_extra: { ...parsed.adif_extra }
  };
}

export const QsoPatchSchema = z.object({
  band: z.string().trim().min(1).max(10).optional(),
  freq_mhz: z.string().regex(/^\d{1,5}(?:\.\d{1,6})?$/).nullable().optional(),
  mode: z.string().trim().min(1).max(16).optional(),
  submode: z.string().trim().max(16).nullable().optional(),
  rst_sent: z.string().trim().max(8).nullable().optional(),
  rst_rcvd: z.string().trim().max(8).nullable().optional(),
  gridsquare: z.string().trim().max(8).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  qth: z.string().trim().max(160).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  adif_extra: z.record(z.string(), z.string()).optional()
}).strict();

export type QsoPatchInput = z.infer<typeof QsoPatchSchema>;

export interface NormalizedQsoPatch {
  band?: string;
  freq_mhz?: string | null;
  freq_hz?: number | null;
  mode?: string;
  submode?: string | null;
  rst_sent?: string | null;
  rst_rcvd?: string | null;
  gridsquare?: string | null;
  name?: string | null;
  qth?: string | null;
  comment?: string | null;
  adif_extra?: Record<string, string>;
}

export function normalizeQsoPatch(input: QsoPatchInput): NormalizedQsoPatch {
  const parsed = QsoPatchSchema.parse(input);
  const normalized: NormalizedQsoPatch = {};

  if (parsed.band !== undefined) normalized.band = parsed.band.trim().toUpperCase();
  if (parsed.mode !== undefined) normalized.mode = parsed.mode.trim().toUpperCase();
  if (parsed.submode !== undefined) normalized.submode = parsed.submode === null ? null : parsed.submode.trim().toUpperCase();
  if (parsed.freq_mhz !== undefined) {
    normalized.freq_mhz = parsed.freq_mhz;
    normalized.freq_hz = parsed.freq_mhz === null ? null : Math.round(Number(parsed.freq_mhz) * 1_000_000);
  }
  if (parsed.rst_sent !== undefined) normalized.rst_sent = parsed.rst_sent === null ? null : parsed.rst_sent.trim();
  if (parsed.rst_rcvd !== undefined) normalized.rst_rcvd = parsed.rst_rcvd === null ? null : parsed.rst_rcvd.trim();
  if (parsed.gridsquare !== undefined) normalized.gridsquare = parsed.gridsquare === null ? null : parsed.gridsquare.trim().toUpperCase();
  if (parsed.name !== undefined) normalized.name = parsed.name === null ? null : parsed.name.trim();
  if (parsed.qth !== undefined) normalized.qth = parsed.qth === null ? null : parsed.qth.trim();
  if (parsed.comment !== undefined) normalized.comment = parsed.comment;
  if (parsed.adif_extra !== undefined) normalized.adif_extra = { ...parsed.adif_extra };

  return normalized;
}
