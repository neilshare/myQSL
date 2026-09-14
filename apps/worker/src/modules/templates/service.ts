import { AnyCardTemplateSchema } from "@myqsl/domain";
import { MediaStore } from "../../platform/r2";
import { TemplateAssetService } from "./asset-service";
import { TemplateRepository, type TemplateRow } from "./repository";

export class TemplateService {
  constructor(private readonly repository: TemplateRepository, private readonly media: MediaStore, private readonly now: () => number = Date.now) {}
  async create(input: { name: string; layout: unknown }): Promise<TemplateRow> { const layout = AnyCardTemplateSchema.parse(input.layout); return this.repository.create({ name: input.name.trim().slice(0, 120), layoutJson: JSON.stringify(layout), now: this.now() }); }
  async list(): Promise<TemplateRow[]> {
    return this.repository.list();
  }
  get(id: number) { return this.repository.get(id); }
  async update(id: number, version: number, input: { name?: string; layout?: unknown }): Promise<TemplateRow | null> {
    const current = await this.repository.get(id);
    if (!current) return null;
    let layoutJson = current.layout_json;
    if (input.layout !== undefined) {
      const parsed = AnyCardTemplateSchema.parse(input.layout);
      layoutJson = JSON.stringify(parsed);
    }
    const name = input.name !== undefined ? input.name.trim().slice(0, 120) : current.name;
    return this.repository.update(id, version, {
      name,
      layoutJson,
      now: this.now()
    });
  }
  async uploadBackground(templateId: number, body: ArrayBuffer, contentType: string): Promise<{ key: string; etag: string }> {
    if (body.byteLength > 8 * 1024 * 1024) throw new Error("Background exceeds 8 MiB");
    const bytes = new Uint8Array(body);
    const isPng = bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpeg) throw new Error("Only PNG/JPEG backgrounds are supported");
    const digest = await crypto.subtle.digest("SHA-256", body);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const ext = isPng ? "png" : "jpg";
    const result = await this.media.putImmutable(`templates/${templateId}/${hash}.${ext}`, body, contentType);
    const row = await this.repository.setBackground(templateId, result.key, hash, this.now());
    if (!row) throw new Error("Template not found");
    return { key: result.key, etag: result.etag };
  }

  async uploadAsset(templateId: number, body: ArrayBuffer, contentType: string) {
    return new TemplateAssetService(this.repository, this.media, this.now).upload(templateId, body, contentType);
  }

  extractAssetIds(layoutJson: string): string[] {
    let parsed: unknown;
    try { parsed = JSON.parse(layoutJson); } catch { return []; }
    if (!parsed || typeof parsed !== "object" || (parsed as { schema_version?: unknown }).schema_version !== 2) return [];
    const elements = (parsed as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) return [];
    return [...new Set(elements.filter((element): element is { type: "image"; asset_id: string } => Boolean(element && typeof element === "object" && (element as { type?: unknown }).type === "image" && typeof (element as { asset_id?: unknown }).asset_id === "string")).map((element) => element.asset_id))];
  }
}
