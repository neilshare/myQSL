export type EmailEnvelope = { delivery_id: string; to: string; from: string; subject: string; html: string; reply_to?: string; attachment?: { filename: string; content: Uint8Array; content_type: "image/png" } };
export type ProviderResult = { provider_id: string; status: "submitted" | "unknown"; request_id?: string };

export class ProviderError extends Error { constructor(readonly code: string, readonly retryable: boolean, message: string) { super(message); } }

export interface EmailProvider { send(envelope: EmailEnvelope, idempotencyKey: string): Promise<ProviderResult>; }

export class ResendProvider implements EmailProvider {
  constructor(private readonly options: { apiKey: string; from: string; endpoint?: string; fetcher?: typeof fetch }) {}
  async send(envelope: EmailEnvelope, idempotencyKey: string): Promise<ProviderResult> {
    if (envelope.attachment && envelope.attachment.content.byteLength > 5 * 1024 * 1024) throw new ProviderError("ATTACHMENT_TOO_LARGE", false, "PNG attachment exceeds 5 MiB");
    if (!envelope.to.includes("@") || /[\r\n]/u.test(envelope.subject) || /<script/iu.test(envelope.html)) throw new ProviderError("EMAIL_PAYLOAD_INVALID", false, "Email payload failed validation");
    const body: Record<string, unknown> = { from: envelope.from, to: [envelope.to], subject: envelope.subject, html: envelope.html };
    if (envelope.reply_to) body.reply_to = envelope.reply_to;
    if (envelope.attachment) body.attachments = [{ filename: envelope.attachment.filename, content: toBase64(envelope.attachment.content), content_type: envelope.attachment.content_type }];
    let response: Response;
    try { response = await (this.options.fetcher ?? fetch)(this.options.endpoint ?? "https://api.resend.com/emails", { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) }); }
    catch { throw new ProviderError("PROVIDER_TIMEOUT", true, "Email provider request failed"); }
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (response.status === 429 || response.status >= 500) throw new ProviderError("PROVIDER_RETRYABLE", true, payload.message ?? `Email provider returned ${response.status}`);
    if (!response.ok || !payload.id) throw new ProviderError("PROVIDER_REJECTED", false, payload.message ?? "Email provider rejected the message");
    return { provider_id: payload.id, status: "submitted", request_id: requestId };
  }
}

export class FakeEmailProvider implements EmailProvider {
  readonly sent: Array<{ envelope: EmailEnvelope; key: string }> = [];
  async send(envelope: EmailEnvelope, idempotencyKey: string): Promise<ProviderResult> { const existing = this.sent.find((item) => item.key === idempotencyKey); if (existing) return { provider_id: `fake-${idempotencyKey}`, status: "submitted" }; this.sent.push({ envelope, key: idempotencyKey }); return { provider_id: `fake-${idempotencyKey}`, status: "submitted" }; }
}

function toBase64(bytes: Uint8Array): string { let value = ""; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) value += String.fromCharCode(...bytes.subarray(i, i + chunk)); return btoa(value); }
