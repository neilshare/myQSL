import { describe, expect, it } from "vitest";
import { RadioEventSchema, canonicalRadioEventPayload, hashRadioEvent, PrintManifestSchema, DeliveryBatchSchema } from "../src/index";

describe("phase 2 contracts", () => {
  const event = {
    protocol_version: 1 as const,
    event_id: "11111111-1111-4111-8111-111111111111",
    profile_id: "profile-1",
    source_kind: "wsjtx" as const,
    event_kind: "qso_logged" as const,
    source_instance: "wsjtx-local",
    source_record_id: "udp-1",
    occurred_at: "2026-09-06T01:00:00.000Z",
    received_at: "2026-09-06T01:00:01.000Z",
    qso: {
      station_callsign: "BA1ABC", call: "K1ABC", qso_date: "20260906", time_on: "010000", band: "20M", mode: "FT8",
      submode: null, freq_mhz: "14.074", rst_sent: "-12", rst_rcvd: "-08", gridsquare: null, name: null, qth: null, comment: null, adif_extra: {}
    },
    extras: {}
  };

  it("requires a qso for a logged event and accepts UTC timestamps", () => {
    const withoutHash = { ...event, payload_sha256: "0".repeat(64) };
    expect(RadioEventSchema.parse(withoutHash).qso?.mode).toBe("FT8");
    expect(() => RadioEventSchema.parse({ ...withoutHash, qso: null })).toThrow(/qso is required/);
  });

  it("canonicalizes event key order and produces a stable hash", async () => {
    const a = { ...event, extras: { z: "2", a: "1" } };
    const b = { ...event, extras: { a: "1", z: "2" } };
    expect(canonicalRadioEventPayload(a)).toBe(canonicalRadioEventPayload(b));
    expect(await hashRadioEvent(a)).toBe(await hashRadioEvent(b));
  });

  it("rejects manifests over the batch limit and invalid delivery status", () => {
    const baseItem = { position: 0, qso_id: 1, card_id: null, snapshot_json: "{}", snapshot_hash: "a".repeat(64), background_asset_id: null, background_sha256: null, public_url: null, qr_omitted: true };
    const manifest = { schema_version: 1 as const, batch_id: "batch", kind: "qso" as const, profile: "a4-four-up-v1" as const, renderer_version: "v1", font_manifest_version: "v1", items: [baseItem], manifest_hash: "b".repeat(64), created_at: 1, expires_at: 2 };
    expect(PrintManifestSchema.parse(manifest).profile).toBe("a4-four-up-v1");
    expect(() => DeliveryBatchSchema.parse({ id: "b", status: "sent", version: 1, language: "zh", attachment_mode: "png", items: [], created_at: 1, ready_at: null, expires_at: null })).toThrow();
  });
});
