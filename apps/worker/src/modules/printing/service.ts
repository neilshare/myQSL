import { PrintManifestSchema, type PrintManifestV1 } from "@myqsl/domain";
import type { Env } from "../../env";

type PrintRequest = { kind: "qso" | "card"; qso_ids?: number[]; card_ids?: string[]; template_id?: number; template_version?: number; profile?: PrintManifestV1["profile"]; qr_policy?: "require_published" | "omit_confirmed" };

async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; const obj = value as Record<string, unknown>; return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`).join(",")}}`; }

export class PrintBatchError extends Error { constructor(readonly code: string, message: string, readonly status = 422) { super(message); } }

export class PrintService {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}

  async create(request: PrintRequest, idempotencyKey: string): Promise<{ manifest: PrintManifestV1; replayed: boolean }> {
    const requestHash = await sha256(stable(request));
    const existing = await this.env.DB.prepare("SELECT id, request_hash, expires_at FROM print_batches WHERE idempotency_key = ?").bind(idempotencyKey).first<{ id: string; request_hash: string; expires_at: number }>();
    if (existing) {
      if (existing.request_hash !== requestHash) throw new PrintBatchError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with different input", 409);
      const manifest = await this.getManifest(existing.id);
      return { manifest, replayed: true };
    }
    const profile = request.profile ?? "a4-four-up-v1";
    const items = await this.freezeItems(request);
    if (items.length === 0 || items.length > 200) throw new PrintBatchError("PRINT_ITEM_LIMIT", "Print selection must contain between 1 and 200 items");
    const createdAt = this.now();
    const expiresAt = createdAt + 7 * 24 * 60 * 60 * 1000;
    const batchId = `print_${crypto.randomUUID()}`;
    const base = { schema_version: 1 as const, batch_id: batchId, kind: request.kind, profile, renderer_version: "pdf-v1", font_manifest_version: "fonts-v1", items, created_at: createdAt, expires_at: expiresAt };
    const manifestHash = await sha256(stable(base));
    const manifest = PrintManifestSchema.parse({ ...base, manifest_hash: manifestHash });
    const statements: D1PreparedStatement[] = [this.env.DB.prepare("INSERT INTO print_batches(id,idempotency_key,request_hash,kind,profile_json,status,renderer_version,font_manifest_version,manifest_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(batchId, idempotencyKey, requestHash, request.kind, JSON.stringify({ profile }), "ready", "pdf-v1", "fonts-v1", manifestHash, createdAt, expiresAt)];
    for (const item of items) statements.push(this.env.DB.prepare("INSERT INTO print_batch_items(batch_id,position,qso_id,card_id,snapshot_json,snapshot_hash,background_asset_id,background_sha256,public_url,qr_omitted) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(batchId, item.position, item.qso_id, item.card_id, item.snapshot_json, item.snapshot_hash, item.background_asset_id, item.background_sha256, item.public_url, item.qr_omitted ? 1 : 0));
    await this.env.DB.batch(statements);
    return { manifest, replayed: false };
  }

  async getManifest(id: string): Promise<PrintManifestV1> {
    const batch = await this.env.DB.prepare("SELECT * FROM print_batches WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!batch) throw new PrintBatchError("NOT_FOUND", "Print batch not found", 404);
    if (Number(batch.expires_at) <= this.now()) throw new PrintBatchError("PRINT_MANIFEST_EXPIRED", "Print batch has expired", 410);
    const rows = await this.env.DB.prepare("SELECT * FROM print_batch_items WHERE batch_id = ? ORDER BY position").bind(id).all<Record<string, unknown>>();
    const items = rows.results.map((row) => ({ position: Number(row.position), qso_id: row.qso_id == null ? null : Number(row.qso_id), card_id: row.card_id == null ? null : String(row.card_id), snapshot_json: String(row.snapshot_json), snapshot_hash: String(row.snapshot_hash), background_asset_id: row.background_asset_id == null ? null : String(row.background_asset_id), background_sha256: row.background_sha256 == null ? null : String(row.background_sha256), public_url: row.public_url == null ? null : String(row.public_url), qr_omitted: Number(row.qr_omitted) === 1 }));
    return PrintManifestSchema.parse({ schema_version: 1, batch_id: String(batch.id), kind: String(batch.kind), profile: JSON.parse(String(batch.profile_json)).profile, renderer_version: String(batch.renderer_version), font_manifest_version: String(batch.font_manifest_version), items, manifest_hash: String(batch.manifest_hash), created_at: Number(batch.created_at), expires_at: Number(batch.expires_at) });
  }

  async items(id: string, limit = 20, cursor = 0): Promise<{ items: ReturnType<PrintService["item"]>[]; next_cursor: number | null }> {
    if (limit < 1 || limit > 20) throw new PrintBatchError("INVALID_LIMIT", "limit must be between 1 and 20");
    const rows = await this.env.DB.prepare("SELECT * FROM print_batch_items WHERE batch_id = ? AND position >= ? ORDER BY position LIMIT ?").bind(id, cursor, limit + 1).all<Record<string, unknown>>();
    const selected = rows.results.slice(0, limit).map((row) => this.item(row));
    return { items: selected, next_cursor: rows.results.length > limit ? Number(rows.results[limit].position) : null };
  }

  async complete(id: string, input: { sha256: string; size_bytes: number; page_count: number; renderer_version: string; preflight_report_hash: string }): Promise<void> {
    const result = await this.env.DB.prepare("UPDATE print_batches SET status='completed',result_hash=?,result_size=?,page_count=? WHERE id=? AND status IN ('ready','completed') AND expires_at > ?").bind(input.sha256, input.size_bytes, input.page_count, id, this.now()).run();
    if (!result.meta.changes) throw new PrintBatchError("PRINT_MANIFEST_EXPIRED", "Print batch is unavailable", 410);
  }

  async cancel(id: string): Promise<void> { const result = await this.env.DB.prepare("UPDATE print_batches SET status='cancelled' WHERE id=? AND status='ready'").bind(id).run(); if (!result.meta.changes) throw new PrintBatchError("NOT_FOUND", "Print batch not found or already completed", 404); }

  private item(row: Record<string, unknown>) { return { position: Number(row.position), qso_id: row.qso_id == null ? null : Number(row.qso_id), card_id: row.card_id == null ? null : String(row.card_id), snapshot_json: String(row.snapshot_json), snapshot_hash: String(row.snapshot_hash), background_asset_id: row.background_asset_id == null ? null : String(row.background_asset_id), background_sha256: row.background_sha256 == null ? null : String(row.background_sha256), public_url: row.public_url == null ? null : String(row.public_url), qr_omitted: Number(row.qr_omitted) === 1 }; }

  private async freezeItems(request: PrintRequest): Promise<PrintManifestV1["items"]> {
    const qrOmitted = request.qr_policy === "omit_confirmed";
    if (request.kind === "qso") {
      if (!request.template_id || !request.qso_ids?.length || new Set(request.qso_ids).size !== request.qso_ids.length) throw new PrintBatchError("PRINT_SELECTION_INVALID", "qso kind requires unique qso_ids and template_id");
      const template = await this.env.DB.prepare("SELECT * FROM card_templates WHERE id = ?").bind(request.template_id).first<Record<string, unknown>>();
      if (!template) throw new PrintBatchError("NOT_FOUND", "Template not found", 404);
      if (request.template_version !== undefined && Number(template.version) !== request.template_version) throw new PrintBatchError("TEMPLATE_VERSION_CONFLICT", "Template changed since it was selected", 409);
      const placeholders = request.qso_ids.map(() => "?").join(",");
      const rows = await this.env.DB.prepare(`SELECT * FROM qsos WHERE id IN (${placeholders}) AND deleted_at IS NULL`).bind(...request.qso_ids).all<Record<string, unknown>>();
      const byId = new Map(rows.results.map((row) => [Number(row.id), row]));
      if (byId.size !== request.qso_ids.length) throw new PrintBatchError("QSO_NOT_FOUND", "One or more selected QSOs are unavailable", 409);
      const layout = JSON.parse(String(template.layout_json));
      return Promise.all(request.qso_ids.map(async (id, position) => {
        const qso = byId.get(id)!;
        const snapshot = { qso: { ...qso, adif_extra: JSON.parse(String(qso.adif_extra_json ?? "{}")) }, template: { ...layout, base_width: Number(template.base_width), base_height: Number(template.base_height) } };
        const snapshotJson = JSON.stringify(snapshot); return { position, qso_id: id, card_id: null, snapshot_json: snapshotJson, snapshot_hash: await sha256(snapshotJson), background_asset_id: template.background_r2_key == null ? null : String(template.background_r2_key), background_sha256: template.background_sha256 == null ? null : String(template.background_sha256), public_url: null, qr_omitted: qrOmitted };
      }));
    }
    if (!request.card_ids?.length || new Set(request.card_ids).size !== request.card_ids.length) throw new PrintBatchError("PRINT_SELECTION_INVALID", "card kind requires unique card_ids");
    const placeholders = request.card_ids.map(() => "?").join(",");
    const rows = await this.env.DB.prepare(`SELECT * FROM qsl_cards WHERE id IN (${placeholders})`).bind(...request.card_ids).all<Record<string, unknown>>();
    const byId = new Map(rows.results.map((row) => [String(row.id), row]));
    if (byId.size !== request.card_ids.length) throw new PrintBatchError("CARD_NOT_FOUND", "One or more selected cards are unavailable", 409);
    return Promise.all(request.card_ids.map(async (id, position) => {
      const card = byId.get(id)!; if (String(card.status) === "void") throw new PrintBatchError("CARD_VOID", `Card ${id} is void`, 409);
      const qso = JSON.parse(String(card.qso_snapshot_json)); const templateSnapshot = JSON.parse(String(card.template_snapshot_json));
      const snapshotJson = JSON.stringify({ qso: { ...qso, public_id: card.public_id }, template: templateSnapshot });
      const published = String(card.status) === "published";
      if (!published && !qrOmitted) throw new PrintBatchError("PUBLIC_CARD_REQUIRED", `Card ${id} is not published`, 409);
      return { position, qso_id: Number(card.qso_id), card_id: id, snapshot_json: snapshotJson, snapshot_hash: await sha256(snapshotJson), background_asset_id: templateSnapshot.background_r2_key ?? null, background_sha256: templateSnapshot.background_sha256 ?? null, public_url: published ? `${this.env.PUBLIC_ORIGIN.replace(/\/$/u, "")}/c/${encodeURIComponent(String(card.public_id))}` : null, qr_omitted: qrOmitted || !published };
    }));
  }
}
