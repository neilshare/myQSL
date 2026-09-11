import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { DeliveryDispatcher } from "../../src/modules/deliveries/dispatcher";
import { FakeEmailProvider } from "../../src/modules/deliveries/provider";
import { encryptContact } from "../../src/platform/pii";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const PII_KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

async function seedDelivery(deletedAt: number | null = null) {
  const encrypted = await encryptContact("operator@example.com", "v1", PII_KEY_B64);
  await env.DB.prepare("INSERT INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BA4RC", 1, 1, 1).run();
  await env.DB.prepare("INSERT INTO qsos(id,station_id,station_callsign,call,qso_date,time_on,qso_at,band,mode,adif_extra_json,dedupe_key,duplicate_ordinal,source,deleted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(1, 1, "BA4RC", "K1ABC", "20260911", "120000", 1, "20M", "FT8", "{}", "dispatch-test", 0, "manual", deletedAt, 1, 1).run();
  await env.DB.prepare("INSERT INTO card_templates(id,name,schema_version,base_width,base_height,layout_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(1, "test", 1, 1264, 848, "{}", 1, 1, 1).run();
  await env.DB.prepare("INSERT INTO qsl_cards(id,qso_id,template_id,public_id,status,qso_snapshot_json,template_snapshot_json,render_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind("card-dispatch", 1, 1, "public-dispatch", "published", JSON.stringify({ call: "K1ABC", qso_date: "20260911", mode: "FT8", station_callsign: "BA4RC" }), "{}", "test", 1, 1).run();
  await env.DB.prepare("INSERT INTO delivery_batches(id,request_key,request_hash,status,request_items_json,language,attachment_mode,created_at) VALUES(?,?,?,?,?,?,?,?)").bind("batch-dispatch", "key-dispatch", "hash-dispatch", "ready", "[\"card-dispatch\"]", "en", "link_only", 1).run();
  await env.DB.prepare("INSERT INTO card_deliveries(id,batch_id,card_id,recipient_ciphertext,recipient_key_version,recipient_nonce,recipient_hmac,masked_email,content_sha256,payload_json_encrypted,status,send_confirmed,provider_key,next_attempt_at,quota_day_utc,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("delivery-dispatch", "batch-dispatch", "card-dispatch", encrypted.ciphertext, encrypted.key_version, encrypted.nonce, "recipient-hmac", "o***r@example.com", "content", "{}", "queued", 1, "delivery-dispatch", NOW, "2026-09-11", NOW, NOW).run();
}

describe("delivery dispatcher", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM delivery_attempts; DELETE FROM card_deliveries; DELETE FROM delivery_batch_items; DELETE FROM delivery_batches; DELETE FROM qsl_cards; DELETE FROM card_templates; DELETE FROM qsos; DELETE FROM stations;");
  });

  it("refuses to send when the source QSO was deleted", async () => {
    await seedDelivery(NOW - 1);
    const provider = new FakeEmailProvider();
    await expect(new DeliveryDispatcher(env, () => NOW, provider).dispatchOne("delivery-dispatch")).resolves.toMatchObject({ submitted: 0, cancelled: 1 });
    expect(provider.sent).toHaveLength(0);
    const row = await env.DB.prepare("SELECT status,reason FROM card_deliveries WHERE id='delivery-dispatch'").first<Record<string, unknown>>();
    expect(row).toMatchObject({ status: "cancelled", reason: "QSO_DELETED" });
  });

  it("records an attempt before provider submission and keeps the provider id", async () => {
    await seedDelivery();
    const provider = new FakeEmailProvider();
    await expect(new DeliveryDispatcher({ ...env, PII_KEY_B64 } as typeof env, () => NOW, provider).dispatchOne("delivery-dispatch")).resolves.toMatchObject({ submitted: 1 });
    expect(provider.sent).toHaveLength(1);
    const attempt = await env.DB.prepare("SELECT attempt_no,lease_token,provider_id,finished_at FROM delivery_attempts WHERE delivery_id='delivery-dispatch'").first<Record<string, unknown>>();
    expect(attempt?.attempt_no).toBe(1);
    expect(attempt?.provider_id).toBe("fake-delivery-dispatch");
    expect(attempt?.finished_at).toBeTypeOf("number");
  });
});
