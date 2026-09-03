import { CardTemplateSchema } from "@eqsr/domain";
import { MediaStore } from "../../platform/r2";
import { TemplateRepository, type TemplateRow } from "./repository";

export class TemplateService {
  constructor(private readonly repository: TemplateRepository, private readonly media: MediaStore, private readonly now: () => number = Date.now) {}
  async create(input: { name: string; layout: unknown }): Promise<TemplateRow> { const layout = CardTemplateSchema.parse(input.layout); return this.repository.create({ name: input.name.trim().slice(0, 120), layoutJson: JSON.stringify(layout), now: this.now() }); }
  list() { return this.repository.list(); }
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
    return { key: result.key, etag: result.etag };
  }
}
