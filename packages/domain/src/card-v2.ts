import { z } from "zod";
import { CardTemplateSchema, PrintableQsoFieldSchema } from "./card";

const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);
const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u);
const FontIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u);
const Mm = z.number().finite();
const PositiveMm = Mm.positive();

const BoundsSchema = z.object({
  x_mm: Mm,
  y_mm: Mm,
  width_mm: PositiveMm,
  height_mm: PositiveMm
});

const BaseNodeSchema = BoundsSchema.extend({
  id: IdSchema,
  name: z.string().trim().min(1).max(80),
  locked: z.boolean(),
  visible: z.boolean(),
  group_id: IdSchema.optional()
});

const TextSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), text: z.string().max(500) }).strict(),
  z.object({ kind: z.literal("qso"), field: z.union([PrintableQsoFieldSchema, z.literal("my_grid")]) }).strict()
]);

const TextNodeSchema = BaseNodeSchema.extend({
  type: z.literal("text"),
  source: TextSourceSchema,
  font_id: FontIdSchema,
  size_pt: z.number().finite().positive().max(144),
  min_size_pt: z.number().finite().positive().max(144),
  color: ColorSchema,
  align: z.enum(["left", "center", "right"]),
  fit: z.enum(["shrink", "wrap"]),
  required: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.min_size_pt > value.size_pt) {
    context.addIssue({ code: "custom", path: ["min_size_pt"], message: "min_size_pt must not exceed size_pt" });
  }
});

const RectNodeSchema = BaseNodeSchema.extend({
  type: z.literal("rect"),
  fill: ColorSchema
}).strict();

const CropSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1)
}).strict().superRefine((value, context) => {
  if (value.x + value.width > 1) context.addIssue({ code: "custom", path: ["width"], message: "crop exceeds image width" });
  if (value.y + value.height > 1) context.addIssue({ code: "custom", path: ["height"], message: "crop exceeds image height" });
});

const ImageNodeSchema = BaseNodeSchema.extend({
  type: z.literal("image"),
  asset_id: IdSchema,
  crop: CropSchema
}).strict();

const QrNodeSchema = BaseNodeSchema.extend({
  type: z.literal("qr"),
  source: z.literal("public_url"),
  quiet_modules: z.literal(4)
}).strict().superRefine((value, context) => {
  if (Math.abs(value.width_mm - value.height_mm) > 0.0001) {
    context.addIssue({ code: "custom", path: ["height_mm"], message: "QR bounds must be square" });
  }
});

export const NodeV2Schema = z.discriminatedUnion("type", [TextNodeSchema, RectNodeSchema, ImageNodeSchema, QrNodeSchema]).superRefine((value, context) => {
  if (value.x_mm < -3 || value.x_mm + value.width_mm > 146) {
    context.addIssue({ code: "custom", path: ["x_mm"], message: "element must stay within 3mm horizontal bleed" });
  }
  if (value.y_mm < -3 || value.y_mm + value.height_mm > 96) {
    context.addIssue({ code: "custom", path: ["y_mm"], message: "element must stay within 3mm vertical bleed" });
  }
});

const PresetSchema = z.object({ id: IdSchema, version: z.number().int().positive() }).strict();

export const CardTemplateV2Schema = z.object({
  schema_version: z.literal(2),
  base_width: z.literal(1400),
  base_height: z.literal(900),
  trim: z.object({ width_mm: z.literal(140), height_mm: z.literal(90) }).strict(),
  bleed_mm: z.literal(3),
  safe_mm: z.literal(5),
  background: ColorSchema,
  font_manifest_version: z.string().trim().min(1).max(120),
  preset: PresetSchema.nullable(),
  elements: z.array(NodeV2Schema).max(80)
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.elements.forEach((element, index) => {
    if (ids.has(element.id)) context.addIssue({ code: "custom", path: ["elements", index, "id"], message: "element id must be unique" });
    ids.add(element.id);
  });
});

export type TextSource = z.infer<typeof TextSourceSchema>;
export type NodeV2 = z.infer<typeof NodeV2Schema>;
export type TemplateV2 = z.infer<typeof CardTemplateV2Schema>;

export const AnyCardTemplateSchema = z.discriminatedUnion("schema_version", [CardTemplateSchema, CardTemplateV2Schema]);
export type AnyCardTemplate = z.infer<typeof AnyCardTemplateSchema>;

export function normalizeTemplateV2(input: unknown): TemplateV2 {
  const parsed = CardTemplateV2Schema.parse(input);
  const serializedBytes = new TextEncoder().encode(JSON.stringify(parsed)).byteLength;
  if (serializedBytes > 256 * 1024) throw new Error("Template JSON exceeds 256 KiB");
  return parsed;
}
