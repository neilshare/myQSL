import { CardTemplateSchema } from "@myqsl/domain";
import { MediaStore } from "../../platform/r2";
import { TemplateRepository, type TemplateRow } from "./repository";

const DEFAULT_CARD_LAYOUT = {
  schema_version: 1 as const,
  base_width: 1920,
  base_height: 1080,
  elements: [
    { type: "text" as const, x: 0.5, y: 0.18, field: "station_callsign" as const, font: "Inter" as const, font_size: 72, color: "#FFFFFF", align: "center" as const },
    { type: "text" as const, x: 0.5, y: 0.38, field: "call" as const, font: "Inter" as const, font_size: 96, color: "#E5A93C", align: "center" as const },
    { type: "text" as const, x: 0.15, y: 0.65, field: "qso_date" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.38, y: 0.65, field: "time_on" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.62, y: 0.65, field: "band" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.85, y: 0.65, field: "mode" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.15, y: 0.8, field: "rst_sent" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.38, y: 0.8, field: "rst_rcvd" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "text" as const, x: 0.62, y: 0.8, field: "freq_mhz" as const, font: "Inter" as const, font_size: 36, color: "#FFFFFF", align: "left" as const },
    { type: "qr" as const, x: 0.84, y: 0.74, width: 0.12, height: 0.21, value: "public_url" as const }
  ]
};

export class TemplateService {
  constructor(private readonly repository: TemplateRepository, private readonly media: MediaStore, private readonly now: () => number = Date.now) {}
  async create(input: { name: string; layout: unknown }): Promise<TemplateRow> { const layout = CardTemplateSchema.parse(input.layout); return this.repository.create({ name: input.name.trim().slice(0, 120), layoutJson: JSON.stringify(layout), now: this.now() }); }
  async list(): Promise<TemplateRow[]> {
    const rows = await this.repository.list();
    if (rows.length === 0) {
      try {
        const seeded = await this.create({
          name: "经典 QSL 卡片 (Classic)",
          layout: DEFAULT_CARD_LAYOUT
        });
        return [seeded];
      } catch {
        return rows;
      }
    }
    return rows;
  }
  get(id: number) { return this.repository.get(id); }
  async update(id: number, version: number, input: { name?: string; layout?: unknown }): Promise<TemplateRow | null> {
    const current = await this.repository.get(id);
    if (!current) return null;
    let layoutJson = current.layout_json;
    if (input.layout !== undefined) {
      const parsed = CardTemplateSchema.parse(input.layout);
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
}
