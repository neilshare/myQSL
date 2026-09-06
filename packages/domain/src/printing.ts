import { z } from "zod";

export const PrintProfileSchema = z.enum(["a4-four-up-v1", "single-bleed-v1"]);
export type PrintProfile = z.infer<typeof PrintProfileSchema>;

export const PrintManifestItemSchema = z.object({
  position: z.number().int().min(0).max(199),
  qso_id: z.number().int().positive().nullable(),
  card_id: z.string().min(1).max(80).nullable(),
  snapshot_json: z.string().min(2).max(200_000),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  background_asset_id: z.string().min(1).max(160).nullable(),
  background_sha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  public_url: z.string().url().nullable(),
  qr_omitted: z.boolean().default(false)
});
export type PrintManifestItem = z.infer<typeof PrintManifestItemSchema>;

export const PrintManifestSchema = z.object({
  schema_version: z.literal(1),
  batch_id: z.string().min(1).max(80),
  kind: z.enum(["qso", "card"]),
  profile: PrintProfileSchema,
  renderer_version: z.string().min(1).max(80),
  font_manifest_version: z.string().min(1).max(80),
  items: z.array(PrintManifestItemSchema).min(1).max(200),
  manifest_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  created_at: z.number().int().nonnegative(),
  expires_at: z.number().int().positive()
});
export type PrintManifestV1 = z.infer<typeof PrintManifestSchema>;
