import type { Env } from "../../env";

function decodeWebhookSecret(secret: string): Uint8Array {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : null;
  if (!encoded) return new TextEncoder().encode(secret);
  try {
    return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(secret);
  }
}

async function hmac(secret: string, value: string): Promise<string> {
  const secretBytes = decodeWebhookSecret(secret);
  const raw = new Uint8Array(secretBytes.byteLength);
  raw.set(secretBytes);
  const key = await crypto.subtle.importKey("raw", raw.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))));
}

export async function verifyWebhookSignature(body: string, headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("svix-id"); const timestamp = headers.get("svix-timestamp"); const signature = headers.get("svix-signature"); if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp); if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const expected = await hmac(secret, `${id}.${timestamp}.${body}`);
  return signature.split(" ").some((candidate) => candidate === `v1,${expected}`);
}

type ResendWebhook = {
  id?: string;
  type?: string;
  created_at?: string;
  data?: { email_id?: string };
};

function eventId(parsed: ResendWebhook): string {
  if (typeof parsed.id === "string" && parsed.id.length > 0) return parsed.id;
  if (parsed.data?.email_id) return `${parsed.data.email_id}:${parsed.type ?? "unknown"}:${parsed.created_at ?? ""}`;
  return crypto.randomUUID();
}

function statusFor(type: string): "submitted" | "delivered" | "bounced" | null {
  if (type === "email.sent") return "submitted";
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced" || type === "email.complained") return "bounced";
  return null;
}

export async function handleResendWebhook(env: Env, body: string, now = Date.now()): Promise<{ duplicate: boolean; applied: boolean }> {
  const parsed = JSON.parse(body) as ResendWebhook;
  const providerEventId = eventId(parsed);
  const providerId = parsed.data?.email_id ?? null;
  const type = typeof parsed.type === "string" ? parsed.type : "unknown";
  const occurredAt = parsed.created_at ? Date.parse(parsed.created_at) : null;
  const existing = await env.DB.prepare("SELECT provider_event_id FROM delivery_webhook_events WHERE provider_event_id=?").bind(providerEventId).first();
  if (existing) return { duplicate: true, applied: false };

  const status = statusFor(type);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO delivery_webhook_events(provider_event_id,provider_id,type,occurred_at,received_at,applied_at) VALUES(?,?,?,?,?,?)")
      .bind(providerEventId, providerId, type, Number.isFinite(occurredAt) ? occurredAt : null, now, status && providerId ? now : null)
  ];

  if (status && providerId) {
    if (status === "bounced") {
      statements.push(
        env.DB.prepare("UPDATE card_deliveries SET status=CASE WHEN status='delivered' THEN status ELSE 'bounced' END, reason=?, updated_at=? WHERE provider_id=?")
          .bind(type === "email.complained" ? "PROVIDER_COMPLAINT" : "PROVIDER_HARD_BOUNCE", now, providerId),
        env.DB.prepare("INSERT INTO email_suppressions(recipient_hmac,reason,source_event_id,created_at) SELECT recipient_hmac,?,?,? FROM card_deliveries WHERE provider_id=? ON CONFLICT(recipient_hmac) DO UPDATE SET reason=excluded.reason,source_event_id=excluded.source_event_id,created_at=excluded.created_at,released_at=NULL")
          .bind(type === "email.complained" ? "PROVIDER_COMPLAINT" : "PROVIDER_HARD_BOUNCE", providerEventId, now, providerId)
      );
    } else if (status === "delivered") {
      statements.push(env.DB.prepare("UPDATE card_deliveries SET status=CASE WHEN status='bounced' THEN status ELSE 'delivered' END, updated_at=? WHERE provider_id=?").bind(now, providerId));
    } else {
      statements.push(env.DB.prepare("UPDATE card_deliveries SET status=CASE WHEN status IN ('delivered','bounced') THEN status ELSE 'submitted' END, updated_at=? WHERE provider_id=?").bind(now, providerId));
    }
  }

  try {
    await env.DB.batch(statements);
    const applied = Boolean(status && providerId && (await env.DB.prepare("SELECT 1 FROM card_deliveries WHERE provider_id=?").bind(providerId).first()));
    return { duplicate: false, applied };
  } catch (error) {
    const duplicate = await env.DB.prepare("SELECT provider_event_id FROM delivery_webhook_events WHERE provider_event_id=?").bind(providerEventId).first();
    if (duplicate) return { duplicate: true, applied: false };
    throw error;
  }
}
