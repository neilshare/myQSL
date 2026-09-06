import type { Env } from "../../env";
import { encryptContact, hashRecipient, maskEmail } from "../../platform/pii";
import { QrzClient, type DirectoryResult } from "./client";

export class DirectoryService {
  constructor(private readonly env: Env, private readonly now: () => number = Date.now) {}

  async lookup(call: string): Promise<DirectoryResult & { contact_id?: string; email_hmac?: string; masked_email?: string }> {
    const requested = call.trim().toUpperCase(); const now = this.now();
    const cached = await this.env.DB.prepare("SELECT * FROM directory_contacts WHERE requested_call = ? AND expires_at > ?").bind(requested, now).first<Record<string, unknown>>();
    if (cached) return { status: String(cached.status) as DirectoryResult["status"], requested_call: requested, resolved_call: cached.resolved_call == null ? null : String(cached.resolved_call), email: null, contact_id: String(cached.id), email_hmac: cached.email_hmac == null ? undefined : String(cached.email_hmac), masked_email: cached.masked_email == null ? undefined : String(cached.masked_email) };
    if (!this.env.QRZ_USERNAME || !this.env.QRZ_PASSWORD) return { status: "unavailable", requested_call: requested, resolved_call: null, email: null, error_code: "QRZ_NOT_CONFIGURED" };
    const result = await new QrzClient({ username: this.env.QRZ_USERNAME, password: this.env.QRZ_PASSWORD, endpoint: this.env.QRZ_ENDPOINT }).lookup(requested);
    const id = `contact_${crypto.randomUUID()}`; const expires = now + 24 * 60 * 60 * 1000;
    let encrypted: { ciphertext: string; nonce: string; key_version: string } | null = null; let hmac: string | null = null; let masked: string | null = null;
    if (result.email && this.env.PII_KEY_B64 && this.env.PII_KEY_VERSION) { encrypted = await encryptContact(result.email, this.env.PII_KEY_VERSION, this.env.PII_KEY_B64); hmac = await hashRecipient(result.email, this.env.PII_KEY_B64); masked = maskEmail(result.email); }
    await this.env.DB.prepare(`INSERT INTO directory_contacts(id,requested_call,resolved_call,status,email_ciphertext,email_key_version,email_nonce,email_hmac,masked_email,lookup_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(requested_call) DO UPDATE SET resolved_call=excluded.resolved_call,status=excluded.status,email_ciphertext=excluded.email_ciphertext,email_key_version=excluded.email_key_version,email_nonce=excluded.email_nonce,email_hmac=excluded.email_hmac,masked_email=excluded.masked_email,lookup_at=excluded.lookup_at,expires_at=excluded.expires_at`).bind(id, requested, result.resolved_call, result.status, encrypted?.ciphertext ?? null, encrypted?.key_version ?? null, encrypted?.nonce ?? null, hmac, masked, now, expires).run();
    return { ...result, contact_id: id, email_hmac: hmac ?? undefined, masked_email: masked ?? undefined };
  }
}
