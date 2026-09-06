import { nanoid } from "nanoid";
import type { Env } from "../../env";

type Request = { qso_ids: number[]; qso_versions?: Record<string, number>; template_id: number; template_version?: number };
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export class CardBatchError extends Error { constructor(readonly code: string, message: string, readonly status = 422) { super(message); } }

export class CardBatchService {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}
  async create(input: Request, requestKey: string): Promise<{ id: string; card_ids: string[]; replayed: boolean }> {
    if (!input.qso_ids.length || input.qso_ids.length > 50 || new Set(input.qso_ids).size !== input.qso_ids.length) throw new CardBatchError("CARD_BATCH_LIMIT", "Select 1–50 unique QSOs");
    const requestHash = await sha256(JSON.stringify(input)); const existing = await this.env.DB.prepare("SELECT id,request_hash FROM card_batches WHERE request_key=?").bind(requestKey).first<{ id: string; request_hash: string }>();
    if (existing) { if (existing.request_hash !== requestHash) throw new CardBatchError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with different input", 409); const rows = await this.env.DB.prepare("SELECT card_id FROM card_batch_items WHERE batch_id=? ORDER BY position").bind(existing.id).all<{ card_id: string }>(); return { id: existing.id, card_ids: rows.results.map((row) => String(row.card_id)), replayed: true }; }
    const template = await this.env.DB.prepare("SELECT * FROM card_templates WHERE id=?").bind(input.template_id).first<Record<string, unknown>>(); if (!template) throw new CardBatchError("TEMPLATE_NOT_FOUND", "Template not found", 404);
    if (input.template_version !== undefined && Number(template.version) !== input.template_version) throw new CardBatchError("TEMPLATE_VERSION_CONFLICT", "Template changed since selection", 409);
    const rows = await this.env.DB.prepare(`SELECT * FROM qsos WHERE id IN (${input.qso_ids.map(() => "?").join(",")}) AND deleted_at IS NULL`).bind(...input.qso_ids).all<Record<string, unknown>>();
    const byId = new Map(rows.results.map((row) => [Number(row.id), row])); if (byId.size !== input.qso_ids.length) throw new CardBatchError("QSO_NOT_FOUND", "One or more QSOs are unavailable", 409);
    for (const [id, version] of Object.entries(input.qso_versions ?? {})) if (byId.get(Number(id)) && Number(byId.get(Number(id))!.version) !== version) throw new CardBatchError("QSO_VERSION_CONFLICT", `QSO ${id} changed since selection`, 409);
    const layout = JSON.parse(String(template.layout_json)); const batchId = `cards_${crypto.randomUUID()}`; const now = this.now(); const cardIds = input.qso_ids.map(() => nanoid(16));
    const statements: D1PreparedStatement[] = [this.env.DB.prepare("INSERT INTO card_batches(id,request_key,request_hash,created_at) VALUES(?,?,?,?)").bind(batchId, requestKey, requestHash, now)];
    input.qso_ids.forEach((qsoId, position) => {
      const qso = byId.get(qsoId)!; const cardId = cardIds[position]; const publicId = nanoid(22); const qsoSnapshot = { call: qso.call, station_callsign: qso.station_callsign, qso_date: qso.qso_date, time_on: qso.time_on, band: qso.band, freq_hz: qso.freq_hz, freq_mhz: qso.freq_hz == null ? null : (Number(qso.freq_hz) / 1_000_000).toFixed(3), mode: qso.mode, submode: qso.submode, rst_sent: qso.rst_sent, rst_rcvd: qso.rst_rcvd, gridsquare: qso.gridsquare, name: qso.name, qth: qso.qth, comment: qso.comment, my_grid: qso.my_grid, public_id: publicId }; const templateSnapshot = { schema_version: 1, version: template.version, base_width: template.base_width, base_height: template.base_height, layout, background_r2_key: template.background_r2_key, background_sha256: template.background_sha256 }; const lookupCall = String(qso.call).toUpperCase();
      statements.push(this.env.DB.prepare("INSERT INTO qsl_cards(id,qso_id,template_id,public_id,status,qso_snapshot_json,template_snapshot_json,render_version,lookup_call,lookup_qso_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(cardId, qsoId, input.template_id, publicId, "draft", JSON.stringify(qsoSnapshot), JSON.stringify(templateSnapshot), "canvas-v1", lookupCall, qso.qso_date, now, now));
      statements.push(this.env.DB.prepare("INSERT INTO card_batch_items(batch_id,position,qso_id,template_version,card_id) VALUES(?,?,?,?,?)").bind(batchId, position, qsoId, Number(template.version), cardId));
    });
    await this.env.DB.batch(statements);
    return { id: batchId, card_ids: cardIds, replayed: false };
  }
  async get(id: string): Promise<Record<string, unknown>> { const batch = await this.env.DB.prepare("SELECT * FROM card_batches WHERE id=?").bind(id).first<Record<string, unknown>>(); if (!batch) throw new CardBatchError("NOT_FOUND", "Card batch not found", 404); const items = await this.env.DB.prepare("SELECT * FROM card_batch_items WHERE batch_id=? ORDER BY position").bind(id).all(); return { ...batch, items: items.results }; }
}
