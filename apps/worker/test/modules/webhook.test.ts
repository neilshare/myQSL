import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleResendWebhook } from "../../src/modules/deliveries/webhook";

async function seedDelivery(status = "submitted", providerId = "provider-1", recipientHmac = "hmac-1") {
  await env.DB.prepare("INSERT INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BA4RC", 1, 1, 1).run();
  await env.DB.prepare("INSERT INTO qsos(id,station_id,station_callsign,call,qso_date,time_on,qso_at,band,mode,adif_extra_json,dedupe_key,duplicate_ordinal,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(1, 1, "BA4RC", "K1ABC", "20260906", "010000", 1, "20M", "FT8", "{}", "webhook-test", 0, "manual", 1, 1).run();
  await env.DB.prepare("INSERT INTO card_templates(id,name,schema_version,base_width,base_height,layout_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(1, "test", 1, 1264, 848, "{}", 1, 1, 1).run();
  await env.DB.prepare("INSERT INTO qsl_cards(id,qso_id,template_id,public_id,status,qso_snapshot_json,template_snapshot_json,render_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind("card-1", 1, 1, "public-1", "published", JSON.stringify({ call: "K1ABC" }), "{}", "test", 1, 1).run();
  await env.DB.prepare("INSERT INTO delivery_batches(id,request_key,request_hash,status,request_items_json,language,attachment_mode,created_at) VALUES(?,?,?,?,?,?,?,?)").bind("batch-1", "key-1", "hash-1", "ready", "[\"card-1\"]", "en", "link_only", 1).run();
  await env.DB.prepare("INSERT INTO card_deliveries(id,batch_id,card_id,recipient_ciphertext,recipient_key_version,recipient_nonce,recipient_hmac,masked_email,content_sha256,payload_json_encrypted,status,send_confirmed,provider_id,provider_key,next_attempt_at,quota_day_utc,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("delivery-1", "batch-1", "card-1", "cipher", "v1", "nonce", recipientHmac, "k***c@example.com", "content", "{}", status, 1, providerId, "delivery-1", 1, "2026-09-06", 1, 1).run();
}

describe("Resend webhook reducer", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM delivery_webhook_events; DELETE FROM email_suppressions; DELETE FROM card_deliveries; DELETE FROM delivery_batch_items; DELETE FROM delivery_batches; DELETE FROM qsl_cards; DELETE FROM card_templates; DELETE FROM qsos; DELETE FROM stations;");
  });

  it("advances submitted to delivered and is idempotent", async () => {
    await seedDelivery();
    const body = JSON.stringify({ id: "evt-delivered-1", type: "email.delivered", created_at: "2026-09-06T01:00:00.000Z", data: { email_id: "provider-1" } });
    await expect(handleResendWebhook(env, body, 2_000)).resolves.toEqual({ duplicate: false, applied: true });
    expect((await env.DB.prepare("SELECT status FROM card_deliveries WHERE id='delivery-1'").first<{ status: string }>())?.status).toBe("delivered");
    await expect(handleResendWebhook(env, body, 3_000)).resolves.toEqual({ duplicate: true, applied: false });
  });

  it("suppresses hard bounces and never downgrades a delivered delivery", async () => {
    await seedDelivery("submitted", "provider-2", "hmac-2");
    const bounce = JSON.stringify({ id: "evt-bounce-1", type: "email.bounced", data: { email_id: "provider-2" } });
    await expect(handleResendWebhook(env, bounce, 2_000)).resolves.toEqual({ duplicate: false, applied: true });
    expect((await env.DB.prepare("SELECT status FROM card_deliveries WHERE id='delivery-1'").first<{ status: string }>())?.status).toBe("bounced");
    expect((await env.DB.prepare("SELECT reason FROM email_suppressions WHERE recipient_hmac='hmac-2'").first<{ reason: string }>())?.reason).toBe("PROVIDER_HARD_BOUNCE");
    await env.DB.prepare("UPDATE card_deliveries SET status='delivered' WHERE id='delivery-1'").run();
    await handleResendWebhook(env, JSON.stringify({ id: "evt-bounce-2", type: "email.bounced", data: { email_id: "provider-2" } }), 3_000);
    expect((await env.DB.prepare("SELECT status FROM card_deliveries WHERE id='delivery-1'").first<{ status: string }>())?.status).toBe("delivered");
  });
});
