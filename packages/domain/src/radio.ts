import { z } from "zod";

export const RadioSourceKindSchema = z.enum(["wsjtx", "n1mm"]);
export type RadioSourceKind = z.infer<typeof RadioSourceKindSchema>;

export const RadioEventKindSchema = z.enum(["qso_logged", "external_replace", "external_delete"]);
export type RadioEventKind = z.infer<typeof RadioEventKindSchema>;

export const RadioEventQsoSchema = z.object({
  station_callsign: z.string().trim().min(3).max(16),
  call: z.string().trim().min(3).max(16),
  qso_date: z.string().regex(/^\d{8}$/),
  time_on: z.string().regex(/^\d{6}$/),
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
export type RadioEventQso = z.infer<typeof RadioEventQsoSchema>;

export const RadioEventSchema = z.object({
  protocol_version: z.literal(1),
  event_id: z.string().uuid(),
  profile_id: z.string().min(1).max(80),
  source_kind: RadioSourceKindSchema,
  event_kind: RadioEventKindSchema,
  source_instance: z.string().min(1).max(160),
  source_record_id: z.string().min(1).max(160),
  occurred_at: z.string().datetime({ offset: true }),
  received_at: z.string().datetime({ offset: true }),
  qso: RadioEventQsoSchema.nullable(),
  extras: z.record(z.string(), z.string()).default({}),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/i)
}).superRefine((value, ctx) => {
  if (value.event_kind === "qso_logged" && !value.qso) ctx.addIssue({ code: "custom", path: ["qso"], message: "qso is required for qso_logged" });
  if (value.event_kind !== "qso_logged" && value.qso && value.source_kind === "n1mm") return;
  if (value.event_kind === "external_delete" && value.qso) ctx.addIssue({ code: "custom", path: ["qso"], message: "delete event must not contain qso" });
});
export type RadioEventV1 = z.infer<typeof RadioEventSchema>;

export const IngestOutcomeSchema = z.enum(["created", "duplicate", "review_required", "rejected"]);
export type IngestOutcome = z.infer<typeof IngestOutcomeSchema>;

export const IngestReceiptSchema = z.object({
  receipt_id: z.string().min(1).max(80),
  event_id: z.string().uuid(),
  outcome: IngestOutcomeSchema,
  qso_id: z.number().int().positive().nullable(),
  duplicate_of: z.number().int().positive().nullable(),
  issues: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  committed_at: z.number().int().nonnegative(),
  replayed: z.boolean()
});
export type IngestReceipt = z.infer<typeof IngestReceiptSchema>;

export function canonicalRadioEventPayload(event: Omit<RadioEventV1, "payload_sha256">): string {
  const stable = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  };
  return stable(event);
}

export async function hashRadioEvent(event: Omit<RadioEventV1, "payload_sha256">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRadioEventPayload(event)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
