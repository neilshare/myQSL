import type { Env } from "../../env";
import { decryptContact } from "../../platform/pii";
import { ResendProvider, type EmailEnvelope } from "./provider";

function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }

export class DeliveryDispatcher {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}

  async dispatchDue(limit = 50): Promise<{ submitted: number; retry: number; unknown: number }> {
    if (!this.env.RESEND_API_KEY || !this.env.RESEND_FROM || !this.env.PII_KEY_B64) return { submitted: 0, retry: 0, unknown: 0 };
    const now = this.now(); const rows = await this.env.DB.prepare("SELECT d.*, c.qso_snapshot_json, c.image_r2_key, b.attachment_mode FROM card_deliveries d JOIN qsl_cards c ON c.id=d.card_id JOIN delivery_batches b ON b.id=d.batch_id WHERE d.send_confirmed=1 AND d.status IN ('queued','retry_wait') AND d.next_attempt_at <= ? ORDER BY d.created_at LIMIT ?").bind(now, limit).all<Record<string, unknown>>();
    const provider = new ResendProvider({ apiKey: this.env.RESEND_API_KEY, from: this.env.RESEND_FROM }); let submitted = 0; let retry = 0; let unknown = 0;
    for (const row of rows.results) {
      const slot = await this.env.DB.prepare("UPDATE dispatch_throttle SET next_send_at=? WHERE id=1 AND next_send_at <= ?").bind(now + 1000, now).run(); if (!slot.meta.changes) break;
      const suppressed = await this.env.DB.prepare("SELECT recipient_hmac FROM email_suppressions WHERE recipient_hmac=? AND released_at IS NULL").bind(String(row.recipient_hmac)).first(); if (suppressed) { await this.env.DB.prepare("UPDATE card_deliveries SET status='cancelled',updated_at=? WHERE id=?").bind(now, row.id).run(); continue; }
      const lease = crypto.randomUUID(); const claimed = await this.env.DB.prepare("UPDATE card_deliveries SET status='sending',lease_token=?,lease_until=?,attempt_count=attempt_count+1,updated_at=? WHERE id=? AND send_confirmed=1 AND status IN ('queued','retry_wait')").bind(lease, now + 60_000, now, row.id).run(); if (!claimed.meta.changes) continue;
      try {
        const email = await decryptContact({ ciphertext: String(row.recipient_ciphertext), nonce: String(row.recipient_nonce), key_version: String(row.recipient_key_version) }, this.env.PII_KEY_B64);
        const qso = JSON.parse(String(row.qso_snapshot_json)) as { call?: string; station_callsign?: string; qso_date?: string; mode?: string };
        const envelope: EmailEnvelope = { delivery_id: String(row.id), to: email, from: this.env.RESEND_FROM, subject: `QSL card for ${qso.station_callsign ?? "my station"} ↔ ${qso.call ?? ""}`, html: `<p>Thank you for the QSO on ${escapeHtml(qso.qso_date ?? "")} (${escapeHtml(qso.mode ?? "")}).</p><p>This message was sent by myQSL.</p>` };
        const result = await provider.send(envelope, String(row.provider_key)); await this.env.DB.prepare("UPDATE card_deliveries SET status='submitted',provider_id=?,first_send_at=COALESCE(first_send_at,?),lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(result.provider_id, now, now, row.id, lease).run(); submitted += 1;
      } catch (error) {
        const retryable = error instanceof Error && /retry|timeout|429|5\d\d/iu.test(error.message);
        if (retryable && Number(row.attempt_count) < 8) { await this.env.DB.prepare("UPDATE card_deliveries SET status='retry_wait',next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(now + Math.min(300_000, 2 ** Number(row.attempt_count) * 1000), now, row.id, lease).run(); retry += 1; }
        else { await this.env.DB.prepare("UPDATE card_deliveries SET status='unknown',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(now, row.id, lease).run(); unknown += 1; }
      }
    }
    return { submitted, retry, unknown };
  }
}
