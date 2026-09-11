import type { Env } from "../../env";
import { decryptContact } from "../../platform/pii";
import { ProviderError, ResendProvider, type EmailEnvelope, type EmailProvider } from "./provider";

const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 8;
const MAX_WINDOW_MS = 23 * 60 * 60 * 1000;

function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }

type DeliveryRow = Record<string, unknown> & {
  id: string;
  status: string;
  attempt_count: number;
  created_at: number;
  recipient_hmac: string;
  provider_key: string;
  recipient_ciphertext: string;
  recipient_nonce: string;
  recipient_key_version: string;
  qso_snapshot_json: string;
  attachment_mode: string;
  card_status: string | null;
  qso_deleted_at: number | null;
};

export type DispatchResult = { submitted: number; retry: number; unknown: number; cancelled: number };

export class DeliveryDispatcher {
  constructor(
    private readonly env: Env,
    private readonly now: () => number = Date.now,
    private readonly injectedProvider?: EmailProvider
  ) {}

  async dispatchDue(limit = 50): Promise<DispatchResult> {
    const rows = await this.rows(undefined, limit);
    return this.dispatchRows(rows);
  }

  async dispatchOne(deliveryId: string): Promise<DispatchResult> {
    const rows = await this.rows(deliveryId, 1);
    return this.dispatchRows(rows);
  }

  private async rows(deliveryId: string | undefined, limit: number): Promise<DeliveryRow[]> {
    const query = `SELECT d.*, c.qso_snapshot_json, c.image_r2_key, c.status AS card_status, q.deleted_at AS qso_deleted_at, b.attachment_mode
      FROM card_deliveries d
      JOIN qsl_cards c ON c.id=d.card_id
      LEFT JOIN qsos q ON q.id=c.qso_id
      JOIN delivery_batches b ON b.id=d.batch_id
      WHERE ${deliveryId ? "d.id=?" : "d.send_confirmed=1 AND d.status IN ('queued','retry_wait') AND d.next_attempt_at <= ?"}
      ORDER BY d.created_at LIMIT ?`;
    const statement = this.env.DB.prepare(query).bind(...(deliveryId ? [deliveryId, limit] : [this.now(), limit]));
    const result = await statement.all<DeliveryRow>();
    return result.results;
  }

  private async dispatchRows(rows: DeliveryRow[]): Promise<DispatchResult> {
    const result: DispatchResult = { submitted: 0, retry: 0, unknown: 0, cancelled: 0 };
    const provider = this.injectedProvider ?? (this.env.RESEND_API_KEY && this.env.RESEND_FROM ? new ResendProvider({ apiKey: this.env.RESEND_API_KEY, from: this.env.RESEND_FROM }) : null);
    for (const row of rows) {
      const now = this.now();
      if (row.status !== "queued" && row.status !== "retry_wait") continue;
      if (now - Number(row.created_at) >= MAX_WINDOW_MS) {
        await this.markUnknown(row.id, "DELIVERY_WINDOW_EXPIRED", now);
        result.unknown += 1;
        continue;
      }
      if (Number(row.attempt_count) >= MAX_ATTEMPTS) {
        await this.markUnknown(row.id, "RETRY_LIMIT_EXCEEDED", now);
        result.unknown += 1;
        continue;
      }
      if (row.card_status !== "published") {
        await this.markCancelled(row.id, "CARD_NOT_PUBLISHED", now);
        result.cancelled += 1;
        continue;
      }
      if (row.qso_deleted_at !== null || row.qso_deleted_at === undefined) {
        await this.markCancelled(row.id, "QSO_DELETED", now);
        result.cancelled += 1;
        continue;
      }
      const suppressed = await this.env.DB.prepare("SELECT recipient_hmac FROM email_suppressions WHERE recipient_hmac=? AND released_at IS NULL").bind(String(row.recipient_hmac)).first();
      if (suppressed) {
        await this.markCancelled(row.id, "RECIPIENT_SUPPRESSED", now);
        result.cancelled += 1;
        continue;
      }
      if (!provider || !this.env.PII_KEY_B64) continue;

      const slot = await this.env.DB.prepare("UPDATE dispatch_throttle SET next_send_at=? WHERE id=1 AND next_send_at <= ?").bind(now + 1000, now).run();
      if (!slot.meta.changes) break;
      const lease = crypto.randomUUID();
      const attemptNo = Number(row.attempt_count) + 1;
      const claimed = await this.env.DB.batch([
        this.env.DB.prepare("UPDATE card_deliveries SET status='sending',lease_token=?,lease_until=?,attempt_count=attempt_count+1,updated_at=? WHERE id=? AND send_confirmed=1 AND status IN ('queued','retry_wait')").bind(lease, now + LEASE_MS, now, row.id),
        this.env.DB.prepare("INSERT INTO delivery_attempts(delivery_id,attempt_no,lease_token,started_at) VALUES(?,?,?,?)").bind(row.id, attemptNo, lease, now)
      ]);
      if (Number(claimed[0]?.meta.changes ?? 0) !== 1) continue;

      let providerAccepted = false;
      try {
        const email = await decryptContact({ ciphertext: String(row.recipient_ciphertext), nonce: String(row.recipient_nonce), key_version: String(row.recipient_key_version) }, this.env.PII_KEY_B64);
        const qso = JSON.parse(String(row.qso_snapshot_json)) as { call?: string; station_callsign?: string; qso_date?: string; mode?: string };
        const envelope: EmailEnvelope = { delivery_id: String(row.id), to: email, from: this.env.RESEND_FROM ?? "", subject: `QSL card for ${qso.station_callsign ?? "my station"} ↔ ${qso.call ?? ""}`, html: `<p>Thank you for the QSO on ${escapeHtml(qso.qso_date ?? "")} (${escapeHtml(qso.mode ?? "")}).</p><p>This message was sent by myQSL.</p>` };
        if (row.attachment_mode === "png") {
          const assetKey = typeof row.image_r2_key === "string" ? row.image_r2_key : "";
          if (!assetKey) throw new Error("CARD_ASSET_MISSING");
          const object = await this.env.MEDIA.get(assetKey);
          if (!object) throw new Error("CARD_ASSET_MISSING");
          const content = new Uint8Array(await object.arrayBuffer());
          if (content.byteLength > 5 * 1024 * 1024) throw new Error("ATTACHMENT_TOO_LARGE");
          envelope.attachment = { filename: `qsl-${String(row.card_id)}.png`, content, content_type: "image/png" };
        }
        const sent = await provider.send(envelope, String(row.provider_key));
        providerAccepted = true;
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE card_deliveries SET status='submitted',provider_id=?,first_send_at=COALESCE(first_send_at,?),lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(sent.provider_id, now, now, row.id, lease),
          this.env.DB.prepare("UPDATE delivery_attempts SET finished_at=?,provider_id=? WHERE delivery_id=? AND attempt_no=? AND lease_token=?").bind(now, sent.provider_id, row.id, attemptNo, lease)
        ]);
        result.submitted += 1;
      } catch (error) {
        if (providerAccepted) continue;
        const code = error instanceof ProviderError ? error.code : error instanceof Error ? error.message : "PROVIDER_FAILED";
        const retryable = error instanceof ProviderError ? error.retryable : /retry|timeout|429|5\d\d/iu.test(code);
        const next = now + Math.min(300_000, 2 ** Math.max(0, attemptNo - 1) * 1000);
        const nextStatus = retryable && attemptNo < MAX_ATTEMPTS ? "retry_wait" : "unknown";
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE card_deliveries SET status=?,reason=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(nextStatus, code.slice(0, 80), next, now, row.id, lease),
          this.env.DB.prepare("UPDATE delivery_attempts SET finished_at=?,error_code=? WHERE delivery_id=? AND attempt_no=? AND lease_token=?").bind(now, code.slice(0, 80), row.id, attemptNo, lease)
        ]);
        if (nextStatus === "retry_wait") result.retry += 1;
        else result.unknown += 1;
      }
    }
    return result;
  }

  private async markCancelled(id: string, reason: string, now: number): Promise<void> {
    await this.env.DB.prepare("UPDATE card_deliveries SET status='cancelled',reason=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','retry_wait','sending')").bind(reason, now, id).run();
  }

  private async markUnknown(id: string, reason: string, now: number): Promise<void> {
    await this.env.DB.prepare("UPDATE card_deliveries SET status='unknown',reason=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','retry_wait','sending')").bind(reason, now, id).run();
  }
}
