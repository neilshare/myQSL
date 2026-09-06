import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Outbox, OutboxCapacityError } from "../src/outbox";
import type { RadioEventV1 } from "@myqsl/domain";

const event = (id = "11111111-1111-4111-8111-111111111111"): RadioEventV1 => ({
  protocol_version: 1, event_id: id, profile_id: "p", source_kind: "wsjtx", event_kind: "qso_logged", source_instance: "s", source_record_id: id,
  occurred_at: "2026-09-06T01:00:00.000Z", received_at: "2026-09-06T01:00:01.000Z", qso: { station_callsign: "BA1ABC", call: "K1ABC", qso_date: "20260906", time_on: "010000", band: "20M", mode: "FT8", submode: null, freq_mhz: "14.074", rst_sent: "-10", rst_rcvd: "-08", gridsquare: null, name: null, qth: null, comment: null, adif_extra: {} }, extras: {}, payload_sha256: "0".repeat(64)
});

describe("durable agent outbox", () => {
  it("survives reopen and keeps unacknowledged payload", () => {
    const path = join(mkdtempSync(join(tmpdir(), "myqsl-agent-")), "outbox.sqlite");
    const first = new Outbox(path); first.enqueue(event(), 1000); const claimed = first.claimDue(1000, 1); expect(claimed).toHaveLength(1); first.close();
    const second = new Outbox(path); expect(second.stats().pending).toBe(1); expect(second.claimDue(1000, 1)).toHaveLength(1); second.close();
  });

  it("does not duplicate an event and enforces configured capacity", () => {
    const path = join(mkdtempSync(join(tmpdir(), "myqsl-agent-")), "outbox.sqlite"); const box = new Outbox(path, { maxEvents: 1, maxBytes: 100000 });
    expect(box.enqueue(event()).inserted).toBe(true); expect(box.enqueue(event()).inserted).toBe(false); expect(() => box.enqueue(event("22222222-2222-4222-8222-222222222222"))).toThrow(OutboxCapacityError); box.close();
  });
});
