import type { Env } from "../../env";
import { DirectoryService } from "../directory/service";

type DeliveryRequest = { card_ids: string[]; language: "zh" | "en"; attachment_mode: "png" | "link_only" };
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`; }
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export class DeliveryError extends Error { constructor(readonly code: string, message: string, readonly status = 422) { super(message); } }

export class DeliveryService {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}
  async create(request: DeliveryRequest, key: string): Promise<{ id: string; replayed: boolean }> {
    if (request.card_ids.length < 1 || request.card_ids.length > 50 || new Set(request.card_ids).size !== request.card_ids.length) throw new DeliveryError("DELIVERY_SELECTION_INVALID", "card_ids must contain 1–50 unique cards");
    const requestHash = await sha256(stable(request)); const existing = await this.env.DB.prepare("SELECT id,request_hash FROM delivery_batches WHERE request_key=?").bind(key).first<{ id: string; request_hash: string }>();
    if (existing) { if (existing.request_hash !== requestHash) throw new DeliveryError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with different input", 409); return { id: existing.id, replayed: true }; }
    const id = `delivery_batch_${crypto.randomUUID()}`; const now = this.now();
    const statements: D1PreparedStatement[] = [this.env.DB.prepare("INSERT INTO delivery_batches(id,request_key,request_hash,status,request_items_json,language,attachment_mode,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, key, requestHash, "preparing", JSON.stringify(request.card_ids), request.language, request.attachment_mode, now)];
    for (const [position, cardId] of request.card_ids.entries()) statements.push(this.env.DB.prepare("INSERT INTO delivery_batch_items(batch_id,position,card_id,preparation_status,updated_at) VALUES(?,?,?,?,?)").bind(id, position, cardId, "pending", now));
    try { await this.env.DB.batch(statements); } catch { throw new DeliveryError("DELIVERY_SELECTION_INVALID", "One or more cards are invalid", 409); }
    return { id, replayed: false };
  }

  async prepare(id: string): Promise<void> {
    const batch = await this.env.DB.prepare("SELECT * FROM delivery_batches WHERE id=?").bind(id).first<Record<string, unknown>>(); if (!batch) throw new DeliveryError("NOT_FOUND", "Delivery batch not found", 404);
    const items = await this.env.DB.prepare("SELECT * FROM delivery_batch_items WHERE batch_id=? AND preparation_status='pending' ORDER BY position").bind(id).all<Record<string, unknown>>();
    const directory = new DirectoryService(this.env, this.now);
    for (const item of items.results) {
      const card = await this.env.DB.prepare("SELECT * FROM qsl_cards WHERE id=?").bind(String(item.card_id)).first<Record<string, unknown>>();
      if (!card || card.status !== "published") { await this.env.DB.prepare("UPDATE delivery_batch_items SET preparation_status='blocked',error_code='CARD_NOT_PUBLISHED',updated_at=? WHERE batch_id=? AND position=?").bind(this.now(), id, Number(item.position)).run(); continue; }
      const qso = JSON.parse(String(card.qso_snapshot_json)) as { call?: string };
      const contact = await directory.lookup(String(qso.call ?? ""));
      if (contact.status !== "ready" || !contact.contact_id) { await this.env.DB.prepare("UPDATE delivery_batch_items SET preparation_status='blocked',error_code=?,updated_at=? WHERE batch_id=? AND position=?").bind(contact.error_code ?? `QRZ_${contact.status.toUpperCase()}`, this.now(), id, Number(item.position)).run(); continue; }
      const contactRow = await this.env.DB.prepare("SELECT * FROM directory_contacts WHERE id=?").bind(contact.contact_id).first<Record<string, unknown>>();
      if (!contactRow || !contactRow.email_ciphertext || !contactRow.email_nonce || !contactRow.email_key_version || !contact.email_hmac || !this.env.PII_KEY_B64) {
        await this.env.DB.prepare("UPDATE delivery_batch_items SET preparation_status='blocked',error_code='PII_NOT_CONFIGURED',updated_at=? WHERE batch_id=? AND position=?").bind(this.now(), id, Number(item.position)).run();
        continue;
      }
      const deliveryId = `delivery_${crypto.randomUUID()}`; const now = this.now(); const quotaDay = new Date(now).toISOString().slice(0, 10); const contentHash = String(card.content_sha256 ?? "");
      try {
        await this.env.DB.batch([
          this.env.DB.prepare("INSERT INTO card_deliveries(id,batch_id,card_id,recipient_ciphertext,recipient_key_version,recipient_nonce,recipient_hmac,masked_email,content_sha256,payload_json_encrypted,status,provider_key,next_attempt_at,quota_day_utc,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(deliveryId, id, String(card.id), contactRow.email_ciphertext ?? null, contactRow.email_key_version ?? null, contactRow.email_nonce ?? null, contact.email_hmac ?? "", contact.masked_email ?? "***", contentHash, JSON.stringify({ card_id: card.id, public_id: card.public_id, language: batch.language, attachment_mode: batch.attachment_mode }), "queued", deliveryId, now, quotaDay, now, now),
          this.env.DB.prepare("UPDATE delivery_batch_items SET preparation_status='ready',directory_contact_id=?,delivery_id=?,updated_at=? WHERE batch_id=? AND position=?").bind(contact.contact_id, deliveryId, now, id, Number(item.position))
        ]);
      } catch { await this.env.DB.prepare("UPDATE delivery_batch_items SET preparation_status='blocked',error_code='DELIVERY_ALREADY_EXISTS',updated_at=? WHERE batch_id=? AND position=?").bind(now, id, Number(item.position)).run(); }
    }
    const ready = await this.env.DB.prepare("SELECT COUNT(*) AS count FROM delivery_batch_items WHERE batch_id=? AND preparation_status='ready'").bind(id).first<{ count: number }>();
    await this.env.DB.prepare("UPDATE delivery_batches SET status=?,version=version+1,ready_at=?,expires_at=? WHERE id=?").bind(Number(ready?.count ?? 0) > 0 ? "ready" : "failed", this.now(), this.now() + 15 * 60_000, id).run();
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const batch = await this.env.DB.prepare("SELECT * FROM delivery_batches WHERE id=?").bind(id).first<Record<string, unknown>>(); if (!batch) throw new DeliveryError("NOT_FOUND", "Delivery batch not found", 404);
    const items = await this.env.DB.prepare("SELECT position,card_id,preparation_status,delivery_id,existing_delivery_id,error_code,updated_at FROM delivery_batch_items WHERE batch_id=? ORDER BY position").bind(id).all();
    return { ...batch, request_items: JSON.parse(String(batch.request_items_json)), items: items.results };
  }

  async send(id: string, deliveryIds: string[], previewVersion: number): Promise<{ queued: number }> {
    const batch = await this.env.DB.prepare("SELECT * FROM delivery_batches WHERE id=?").bind(id).first<Record<string, unknown>>(); if (!batch) throw new DeliveryError("NOT_FOUND", "Delivery batch not found", 404);
    if (String(batch.status) !== "ready" || Number(batch.version) !== previewVersion || Number(batch.expires_at) <= this.now()) throw new DeliveryError("PREVIEW_EXPIRED", "Delivery preview expired or changed", 409);
    if (deliveryIds.length < 1 || deliveryIds.length > 50) throw new DeliveryError("DELIVERY_SELECTION_INVALID", "Select at least one prepared delivery");
    const rows = await this.env.DB.prepare(`SELECT id FROM card_deliveries WHERE batch_id=? AND id IN (${deliveryIds.map(() => "?").join(",")}) AND status='queued' AND send_confirmed=0`).bind(id, ...deliveryIds).all<{ id: string }>();
    if (rows.results.length !== deliveryIds.length) throw new DeliveryError("DELIVERY_SELECTION_INVALID", "Some selected deliveries are no longer queued", 409);
    const quota = Number(this.env.EMAIL_DAILY_QUOTA ?? "100"); const day = new Date(this.now()).toISOString().slice(0, 10);
    const quotaStmt = this.env.DB.prepare("INSERT INTO dispatch_daily_quotas(day_utc,reserved_count,attempted_count) VALUES(?,?,0) ON CONFLICT(day_utc) DO UPDATE SET reserved_count=reserved_count+excluded.reserved_count WHERE dispatch_daily_quotas.reserved_count + excluded.reserved_count <= ?").bind(day, deliveryIds.length, quota);
    const confirmStmt = this.env.DB.prepare(`UPDATE card_deliveries SET send_confirmed=1,updated_at=? WHERE batch_id=? AND id IN (${deliveryIds.map(() => "?").join(",")}) AND send_confirmed=0`).bind(this.now(), id, ...deliveryIds);
    const [quotaResult, confirmResult] = await this.env.DB.batch([quotaStmt, confirmStmt]);
    if (!quotaResult.meta.changes || Number(confirmResult.meta.changes) !== deliveryIds.length) throw new DeliveryError("DAILY_QUOTA_EXCEEDED", "Daily email quota or delivery state changed", 429);
    return { queued: deliveryIds.length };
  }
}
