import { z } from "zod";

export const PrintableQsoFieldSchema = z.enum([
  "station_callsign",
  "call",
  "qso_date",
  "time_on",
  "band",
  "mode",
  "submode",
  "freq_mhz",
  "rst_sent",
  "rst_rcvd",
  "gridsquare",
  "name",
  "qth",
  "comment"
]);
export type PrintableQsoField = z.infer<typeof PrintableQsoFieldSchema>;

const NormalizedCoordinate = z.number().finite().min(0).max(1);
const Color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const Font = z.enum(["Inter", "Noto Sans", "Arial", "Helvetica", "sans-serif", "serif", "monospace"]);

const TextElementSchema = z.object({
  type: z.literal("text"),
  x: NormalizedCoordinate,
  y: NormalizedCoordinate,
  field: PrintableQsoFieldSchema,
  font: Font.default("Inter"),
  font_size: z.number().finite().positive().max(512).default(32),
  color: Color.default("#FFFFFF"),
  align: z.enum(["left", "center", "right"]).default("left"),
  max_width: NormalizedCoordinate.optional()
});

const QrElementSchema = z.object({
  type: z.literal("qr"),
  x: NormalizedCoordinate,
  y: NormalizedCoordinate,
  width: NormalizedCoordinate,
  height: NormalizedCoordinate,
  value: z.enum(["public_url", "card_token"]).default("public_url")
});

export const CardElementSchema = z.discriminatedUnion("type", [TextElementSchema, QrElementSchema]);

export const CardTemplateSchema = z.object({
  schema_version: z.literal(1),
  base_width: z.number().int().positive().max(20_000),
  base_height: z.number().int().positive().max(20_000),
  elements: z.array(CardElementSchema).max(40)
});

export type CardElement = z.infer<typeof CardElementSchema>;
export type CardTemplate = z.infer<typeof CardTemplateSchema>;
