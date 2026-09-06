import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hashRadioEvent, type RadioEventV1 } from "@myqsl/domain";
import { Outbox } from "../src/outbox";
import { AgentAuthError, Uploader } from "../src/uploader";

async function event(): Promise<RadioEventV1> {
  const base: Omit<RadioEventV1, "payload_sha256"> = { protocol_version: 1, event_id: "33333333-3333-4333-8333-333333333333", profile_id: "p", source_kind: "wsjtx", event_kind: "qso_logged", source_instance: "s", source_record_id: "r", occurred_at: "2026-09-06T01:00:00.000Z", received_at: "2026-09-06T01:00:01.000Z", qso: { station_callsign: "BA4RC", call: "K1ABC", qso_date: "20260906", time_on: "010000", band: "20M", mode: "FT8", submode: null, freq_mhz: "14.074", rst_sent: "-10", rst_rcvd: "-08", gridsquare: null, name: null, qth: null, comment: null, adif_extra: {} }, extras: {} };
  return { ...base, payload_sha256: await hashRadioEvent(base) } as RadioEventV1;
}

describe("agent uploader", () => {
  it("acks a matching receipt and retries transient responses", async () => {
    const box = new Outbox(join(mkdtempSync(join(tmpdir(), "myqsl-uploader-")), "outbox.sqlite")); const payload = await event(); box.enqueue(payload, 1000);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: { receipt_id: "r", event_id: payload.event_id, outcome: "created", qso_id: 1, duplicate_of: null, issues: [], committed_at: 1000, replayed: false } }), { status: 201 }));
    const uploader = new Uploader(box, { origin: "https://myqsl.app", device_token: "mqa_" + "x".repeat(40), access_client_id: "id", access_client_secret: "secret" });
    await expect(uploader.flush(1000)).resolves.toMatchObject({ attempted: 1, acked: 1 }); expect(box.stats().acked).toBe(1); expect(fetcher).toHaveBeenCalledOnce(); fetcher.mockRestore(); box.close();
  });

  it("pauses on authentication errors without dropping the event", async () => {
    const box = new Outbox(join(mkdtempSync(join(tmpdir(), "myqsl-uploader-")), "outbox.sqlite")); const payload = await event(); box.enqueue(payload, 1000);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    const uploader = new Uploader(box, { origin: "https://myqsl.app", device_token: "mqa_" + "x".repeat(40), access_client_id: "id", access_client_secret: "secret" });
    await expect(uploader.flush(1000)).resolves.toMatchObject({ attempted: 1, acked: 0 }); expect(uploader.isPaused).toBe(true); expect(box.stats().retry_wait).toBe(1); expect(AgentAuthError).toBeDefined(); fetcher.mockRestore(); box.close();
  });
});
