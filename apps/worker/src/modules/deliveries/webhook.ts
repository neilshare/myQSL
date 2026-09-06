import type { Env } from "../../env";

async function hmac(secret: string, value: string): Promise<string> { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))))); }

export async function verifyWebhookSignature(body: string, headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("svix-id"); const timestamp = headers.get("svix-timestamp"); const signature = headers.get("svix-signature"); if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp); if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const expected = await hmac(secret, `${id}.${timestamp}.${body}`);
  return signature.split(" ").some((candidate) => candidate === `v1,${expected}`);
}

export async function handleResendWebhook(env: Env, body: string): Promise<{ duplicate: boolean }> {
  const parsed = JSON.parse(body) as { type?: string; data?: { email_id?: string }; created_at?: string };
  const providerEventId = parsed.data?.email_id ? `${parsed.data.email_id}:${parsed.type ?? "unknown"}:${parsed.created_at ?? ""}` : crypto.randomUUID();
  try { await env.DB.prepare("INSERT INTO delivery_webhook_events(provider_event_id,provider_id,type,occurred_at,received_at,applied_at) VALUES(?,?,?,?,?,?)").bind(providerEventId, parsed.data?.email_id ?? null, parsed.type ?? "unknown", parsed.created_at ? Date.parse(parsed.created_at) : null, Date.now(), Date.now()).run(); return { duplicate: false }; } catch { return { duplicate: true }; }
}
