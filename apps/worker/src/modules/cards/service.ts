import { CardTemplateSchema, publicCardPath } from "@myqsl/domain";
import { nanoid } from "nanoid";
import { MediaStore } from "../../platform/r2";
import { QsoRepository } from "../qsos/repository";
import { TemplateRepository } from "../templates/repository";
import { CardRepository, type CardRow } from "./repository";

export class CardStateError extends Error {}
export class CardService {
  constructor(private readonly repository: CardRepository, private readonly qsos: QsoRepository, private readonly templates: TemplateRepository, private readonly media: MediaStore, private readonly now: () => number = Date.now) {}
  async createDraft(qsoId: number, templateId: number): Promise<CardRow & { public_url: string }> {
    const qso = await this.qsos.findById(qsoId); const template = await this.templates.get(templateId);
    if (!qso || !template) throw new Error("QSO or template not found");
    const layout = CardTemplateSchema.parse(JSON.parse(template.layout_json));
    const qsoSnapshot = {
      call: qso.call,
      station_callsign: qso.station_callsign,
      qso_date: qso.qso_date,
      time_on: qso.time_on,
      band: qso.band,
      freq_hz: qso.freq_hz,
      freq_mhz: qso.freq_hz ? (qso.freq_hz / 1_000_000).toFixed(3) : null,
      mode: qso.mode,
      submode: qso.submode,
      rst_sent: qso.rst_sent,
      rst_rcvd: qso.rst_rcvd,
      gridsquare: qso.gridsquare,
      name: qso.name,
      qth: qso.qth,
      comment: qso.comment,
      my_grid: qso.my_grid
    };
    const templateSnapshot = { schema_version: 1, version: template.version, base_width: template.base_width, base_height: template.base_height, layout, background_r2_key: template.background_r2_key, background_sha256: template.background_sha256 };
    const row = await this.repository.create({
      id: nanoid(16),
      qsoId,
      templateId,
      publicId: nanoid(22),
      qsoSnapshot: JSON.stringify(qsoSnapshot),
      templateSnapshot: JSON.stringify(templateSnapshot),
      lookupCall: qso.call.toUpperCase(),
      lookupQsoDate: qso.qso_date,
      now: this.now()
    });
    return { ...row, public_url: publicCardPath(row.public_id) };
  }
  async get(id: string): Promise<CardRow | null> {
    return this.repository.get(id);
  }
  async attachImage(cardId: string, bytes: ArrayBuffer, expectedHash?: string): Promise<CardRow> {
    const digest = await crypto.subtle.digest("SHA-256", bytes); const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (expectedHash && expectedHash !== hash) throw new CardStateError("Content hash mismatch");
    const result = await this.media.putImmutable(`cards/${cardId}/canvas-v1/${hash}.png`, bytes, "image/png");
    const current = await this.repository.get(cardId);
    if (current?.status === "ready" && current.content_sha256 === hash) return current;
    if (current?.status !== "draft") throw new CardStateError("Card is not in draft state");
    const row = await this.repository.attach(cardId, result.key, hash, this.now()); if (!row || row.status === "draft") throw new CardStateError("Card is not in draft state"); return row;
  }
  async publish(cardId: string): Promise<CardRow> {
    const current = await this.repository.get(cardId);
    if (!current) throw new CardStateError("Card not found");
    if (current.status === "published") return current;
    if (current.status !== "ready") throw new CardStateError("Card must be ready before publishing");
    const row = await this.repository.publish(cardId, this.now());
    if (!row || row.status !== "published") throw new CardStateError("Card must be ready before publishing");
    return row;
  }
  async void(cardId: string): Promise<CardRow> {
    const current = await this.repository.get(cardId);
    if (!current) throw new CardStateError("Card not found");
    if (current.status === "void") return current;
    if (current.status !== "published") throw new CardStateError("Only published cards can be voided");
    const row = await this.repository.void(cardId, this.now());
    if (!row || row.status !== "void") throw new CardStateError("Card cannot be voided");
    return row;
  }
  async list(cursor?: { created_at: number; id: string }, limit = 50): Promise<CardRow[]> {
    return this.repository.list(cursor, limit);
  }
}
