import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { PrintBatchError, PrintService } from "../../src/modules/printing/service";

describe("print batch freeze service", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM print_batch_items; DELETE FROM print_batches; DELETE FROM qsl_cards; DELETE FROM card_templates; DELETE FROM qsos; DELETE FROM stations;");
    await env.DB.prepare("INSERT INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BA4RC", 1, 1, 1).run();
    await env.DB.prepare("INSERT INTO qsos(id,station_id,station_callsign,call,qso_date,time_on,qso_at,band,mode,adif_extra_json,dedupe_key,duplicate_ordinal,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(1, 1, "BA4RC", "K1ABC", "20260906", "010000", 1, "20M", "FT8", "{}", "print-test", 0, "manual", 1, 1).run();
    await env.DB.prepare("INSERT INTO card_templates(id,name,schema_version,base_width,base_height,layout_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(1, "test", 1, 1264, 848, JSON.stringify({ schema_version: 1, base_width: 1264, base_height: 848, elements: [{ type: "text", x: 0.1, y: 0.2, field: "call", font: "Inter", font_size: 32, color: "#000000", align: "left" }] }), 1, 1, 1).run();
  });

  it("freezes ordered snapshots and replays the same idempotency key", async () => {
    const service = new PrintService(env, () => 1000);
    const first = await service.create({ kind: "qso", qso_ids: [1], template_id: 1, profile: "a4-four-up-v1", qr_policy: "omit_confirmed" }, "print-key");
    expect(first.replayed).toBe(false); expect(first.manifest.items[0].snapshot_json).toContain("K1ABC");
    const replay = await service.create({ kind: "qso", qso_ids: [1], template_id: 1, profile: "a4-four-up-v1", qr_policy: "omit_confirmed" }, "print-key");
    expect(replay.replayed).toBe(true); expect(replay.manifest.batch_id).toBe(first.manifest.batch_id);
    await expect(service.create({ kind: "qso", qso_ids: [1], template_id: 1, profile: "single-bleed-v1", qr_policy: "omit_confirmed" }, "print-key")).rejects.toBeInstanceOf(PrintBatchError);
  });
});
