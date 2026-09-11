import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { DeliveryScheduler } from "../../src/modules/deliveries/scheduler";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");

async function seedDelivery(input: {
  id: string;
  status: "queued" | "sending";
  createdAt: number;
  leaseUntil?: number;
  attemptCount?: number;
}) {
  await env.DB.prepare("INSERT OR IGNORE INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BA4RC", 1, 1, 1).run();
  await env.DB.prepare("INSERT OR IGNORE INTO qsos(id,station_id,station_callsign,call,qso_date,time_on,qso_at,band,mode,adif_extra_json,dedupe_key,duplicate_ordinal,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(1, 1, "BA4RC", "K1ABC", "20260911", "120000", 1, "20M", "FT8", "{}", input.id, 0, "manual", 1, 1).run();
  await env.DB.prepare("INSERT OR IGNORE INTO card_templates(id,name,schema_version,base_width,base_height,layout_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(1, "test", 1, 1264, 848, "{}", 1, 1, 1).run();
  await env.DB.prepare("INSERT INTO qsl_cards(id,qso_id,template_id,public_id,status,qso_snapshot_json,template_snapshot_json,render_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(`card-${input.id}`, 1, 1, `public-${input.id}`, "published", JSON.stringify({ call: "K1ABC" }), "{}", "test", 1, 1).run();
  await env.DB.prepare("INSERT INTO delivery_batches(id,request_key,request_hash,status,request_items_json,language,attachment_mode,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(`batch-${input.id}`, `key-${input.id}`, `hash-${input.id}`, "ready", JSON.stringify([`card-${input.id}`]), "en", "link_only", 1).run();
  await env.DB.prepare("INSERT INTO card_deliveries(id,batch_id,card_id,recipient_ciphertext,recipient_key_version,recipient_nonce,recipient_hmac,masked_email,content_sha256,payload_json_encrypted,status,send_confirmed,provider_key,next_attempt_at,attempt_count,quota_day_utc,lease_token,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(input.id, `batch-${input.id}`, `card-${input.id}`, "cipher", "v1", "nonce", `hmac-${input.id}`, "k***c@example.com", "content", "{}", input.status, 1, input.id, NOW, input.attemptCount ?? 0, "2026-09-11", input.status === "sending" ? `lease-${input.id}` : null, input.leaseUntil ?? null, input.createdAt, input.createdAt).run();
}

describe("delivery recovery scheduler", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM delivery_attempts; DELETE FROM card_deliveries; DELETE FROM delivery_batch_items; DELETE FROM delivery_batches; DELETE FROM qsl_cards; DELETE FROM card_templates; DELETE FROM qsos; DELETE FROM stations;");
  });

  it("requeues an expired lease without changing the stable delivery key", async () => {
    await seedDelivery({ id: "delivery-recover", status: "sending", createdAt: NOW - 10_000, leaseUntil: NOW - 1 });
    await expect(new DeliveryScheduler(env, () => NOW).recover()).resolves.toEqual({ recovered: 1, expired: 0 });
    const row = await env.DB.prepare("SELECT status,provider_key,lease_token,lease_until,next_attempt_at,reason FROM card_deliveries WHERE id=?").bind("delivery-recover").first<Record<string, unknown>>();
    expect(row).toMatchObject({ status: "retry_wait", provider_key: "delivery-recover", lease_token: null, lease_until: null, next_attempt_at: NOW, reason: "LEASE_EXPIRED" });
  });

  it("moves exhausted or over-age deliveries to unknown instead of retrying", async () => {
    await seedDelivery({ id: "delivery-attempts", status: "sending", createdAt: NOW - 10_000, leaseUntil: NOW - 1, attemptCount: 8 });
    await seedDelivery({ id: "delivery-age", status: "queued", createdAt: NOW - 23 * 60 * 60 * 1000 - 1 });
    await expect(new DeliveryScheduler(env, () => NOW).recover()).resolves.toEqual({ recovered: 0, expired: 2 });
    const rows = await env.DB.prepare("SELECT id,status,reason FROM card_deliveries ORDER BY id").all<{ id: string; status: string; reason: string }>();
    expect(rows.results).toEqual([
      { id: "delivery-age", status: "unknown", reason: "DELIVERY_WINDOW_EXPIRED" },
      { id: "delivery-attempts", status: "unknown", reason: "RETRY_LIMIT_EXCEEDED" }
    ]);
  });

  it("leaves an active lease untouched", async () => {
    await seedDelivery({ id: "delivery-active", status: "sending", createdAt: NOW - 10_000, leaseUntil: NOW + 10_000 });
    await expect(new DeliveryScheduler(env, () => NOW).recover()).resolves.toEqual({ recovered: 0, expired: 0 });
    const row = await env.DB.prepare("SELECT status,lease_token,lease_until FROM card_deliveries WHERE id=?").bind("delivery-active").first<Record<string, unknown>>();
    expect(row).toMatchObject({ status: "sending", lease_token: "lease-delivery-active", lease_until: NOW + 10_000 });
  });

  it("schedules each due delivery through the workflow binding", async () => {
    await seedDelivery({ id: "delivery-workflow", status: "queued", createdAt: NOW - 1 });
    const created: unknown[] = [];
    const workflowEnv = { ...env, EMAIL_DISPATCH_WORKFLOW: { create: async (input: unknown) => { created.push(input); } } } as typeof env;
    await expect(new DeliveryScheduler(workflowEnv, () => NOW).scheduleDue()).resolves.toMatchObject({ scheduled: 1 });
    expect(created).toEqual([{ params: { delivery_id: "delivery-workflow" } }]);
  });
});
