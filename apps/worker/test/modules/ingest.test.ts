import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hashRadioEvent, type RadioEventV1 } from "@myqsl/domain";
import { IngestService } from "../../src/modules/ingest/service";

const agent = { deviceId: "dev-test", profileIds: ["profile-test"], actor: "agent:dev-test" };

async function event(overrides: Partial<RadioEventV1> = {}): Promise<RadioEventV1> {
  const base: Omit<RadioEventV1, "payload_sha256"> = {
    protocol_version: 1, event_id: "11111111-1111-4111-8111-111111111111", profile_id: "profile-test", source_kind: "wsjtx", event_kind: "qso_logged", source_instance: "wsjtx-test", source_record_id: "qso-1", occurred_at: "2026-09-06T01:00:00.000Z", received_at: "2026-09-06T01:00:01.000Z", qso: { station_callsign: "BA4RC", call: "K1ABC", qso_date: "20260906", time_on: "010000", band: "20M", mode: "FT8", submode: null, freq_mhz: "14.074", rst_sent: "-10", rst_rcvd: "-08", gridsquare: null, name: null, qth: null, comment: null, adif_extra: {} }, extras: {}
  };
  const merged = { ...base, ...overrides } as Omit<RadioEventV1, "payload_sha256">;
  return { ...merged, payload_sha256: await hashRadioEvent(merged) } as RadioEventV1;
}

describe("radio ingest", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM ingest_events; DELETE FROM qso_source_links; DELETE FROM agent_profiles; DELETE FROM agent_devices; DELETE FROM qsos; DELETE FROM stations;");
    await env.DB.prepare("INSERT INTO stations(id,callsign,is_default,created_at,updated_at) VALUES(?,?,?,?,?)").bind(1, "BA4RC", 1, 1, 1).run();
    await env.DB.prepare("INSERT INTO agent_devices(id,name,token_sha256,token_expires_at,created_at) VALUES(?,?,?,?,?)").bind("dev-test", "test", "x", Date.now() + 100000, 1).run();
    await env.DB.prepare("INSERT INTO agent_profiles(id,device_id,station_id,source_kind,source_instance,expected_station_callsign,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind("profile-test", "dev-test", 1, "wsjtx", "wsjtx-test", "BA4RC", 1, 1).run();
  });

  it("commits one QSO, source link, receipt and replays durably", async () => {
    const service = new IngestService(env.DB, () => 1000);
    const first = await service.ingest(await event(), agent);
    expect(first.status).toBe(201);
    expect(first.receipt.outcome).toBe("created");
    const replay = await service.ingest(await event(), agent);
    expect(replay.status).toBe(200);
    expect(replay.receipt.replayed).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM qsos").first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events").first<{ count: number }>())?.count).toBe(1);
  });

  it("returns conflict for reused event id and duplicate for a different event with same QSO", async () => {
    const service = new IngestService(env.DB, () => 1000);
    await service.ingest(await event(), agent);
    await expect(service.ingest(await event({ qso: { ...(await event()).qso!, comment: "changed" } }), agent)).rejects.toThrow("different payload");
    const duplicate = await service.ingest(await event({ event_id: "22222222-2222-4222-8222-222222222222", source_record_id: "qso-2" }), agent);
    expect(duplicate.receipt.outcome).toBe("duplicate");
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM qsos").first<{ count: number }>())?.count).toBe(1);
  });
});
