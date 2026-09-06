import { PrintManifestSchema, type PrintManifestV1 } from "@myqsl/domain";
import { layoutForProfile } from "./layout";

export type PrintAsset = { id: string; bytes: Uint8Array; mime: "image/png" | "image/jpeg"; width_px: number; height_px: number };
export type PreflightIssue = { code: string; severity: "error" | "warning"; position?: number; message: string };
export type PreflightReport = { ok: boolean; errors: PreflightIssue[]; warnings: PreflightIssue[]; page_count: number; item_count: number; unique_backgrounds: number };

export function readSnapshot(raw: string): { qso: Record<string, unknown>; template: { base_width: number; base_height: number; elements: Array<Record<string, unknown>> } } {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const qso = (parsed.qso ?? parsed.qso_snapshot ?? parsed) as Record<string, unknown>;
  const rawTemplate = (parsed.template ?? parsed.template_snapshot ?? parsed.layout) as Record<string, unknown>;
  const template = (rawTemplate?.layout ? { ...rawTemplate, ...(rawTemplate.layout as Record<string, unknown>) } : rawTemplate) as { base_width: number; base_height: number; elements: Array<Record<string, unknown>> };
  if (!template || !Number.isFinite(template.base_width) || !Number.isFinite(template.base_height) || !Array.isArray(template.elements)) throw new Error("snapshot_json must contain a template layout");
  return { qso, template };
}

export function preflight(input: PrintManifestV1, assets: Map<string, PrintAsset>, now = Date.now()): PreflightReport {
  const manifest = PrintManifestSchema.parse(input);
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  if (manifest.expires_at <= now) errors.push({ code: "PRINT_MANIFEST_EXPIRED", severity: "error", message: "Print manifest has expired" });
  if (manifest.items.length > 200) errors.push({ code: "PRINT_ITEM_LIMIT", severity: "error", message: "A print batch cannot contain more than 200 items" });
  const layout = layoutForProfile(manifest.profile);
  const pageCount = Math.ceil(manifest.items.length / layout.slots.length);
  const backgroundIds = new Set<string>();
  let backgroundBytes = 0;
  for (const item of manifest.items) {
    if (item.background_asset_id) {
      backgroundIds.add(item.background_asset_id);
      const asset = assets.get(item.background_asset_id);
      if (!asset) errors.push({ code: "PRINT_ASSET_MISSING", severity: "error", position: item.position, message: `Background asset ${item.background_asset_id} is missing` });
      else {
        backgroundBytes += asset.bytes.byteLength;
        const dpi = Math.min(asset.width_px / (140 / 25.4), asset.height_px / (90 / 25.4));
        if (dpi < 150) errors.push({ code: "PRINT_DPI_TOO_LOW", severity: "error", position: item.position, message: `Background effective DPI ${Math.round(dpi)} is below 150` });
        else if (dpi < 300) warnings.push({ code: "PRINT_DPI_WARNING", severity: "warning", position: item.position, message: `Background effective DPI ${Math.round(dpi)} is below 300` });
      }
    }
    try {
      const { template, qso } = readSnapshot(item.snapshot_json);
      const ratio = template.base_width / template.base_height;
      const targetRatio = 140 / 90;
      if (Math.abs(ratio / targetRatio - 1) > 0.01) warnings.push({ code: "PRINT_PROFILE_MISMATCH", severity: "warning", position: item.position, message: "Template aspect ratio differs from the 140×90 mm print profile" });
      for (const element of template.elements) {
        if (element.type === "qr" && !item.qr_omitted) {
          const value = element.value === "card_token" ? String(qso.public_id ?? "") : String(item.public_url ?? "");
          if (!value) errors.push({ code: "QR_EMPTY", severity: "error", position: item.position, message: "QR element has no published URL or card token" });
          if (Number(element.width) !== Number(element.height)) warnings.push({ code: "QR_NOT_SQUARE", severity: "warning", position: item.position, message: "QR element is not square" });
        }
      }
    } catch (error) {
      errors.push({ code: "PRINT_SNAPSHOT_INVALID", severity: "error", position: item.position, message: error instanceof Error ? error.message : "Invalid snapshot" });
    }
  }
  if (backgroundIds.size > 10) errors.push({ code: "PRINT_BACKGROUND_LIMIT", severity: "error", message: "A print batch may reference at most 10 unique backgrounds" });
  if (backgroundBytes > 30 * 1024 * 1024) errors.push({ code: "PRINT_BACKGROUND_BYTES", severity: "error", message: "Background assets exceed 30 MiB" });
  return { ok: errors.length === 0, errors, warnings, page_count: pageCount, item_count: manifest.items.length, unique_backgrounds: backgroundIds.size };
}
