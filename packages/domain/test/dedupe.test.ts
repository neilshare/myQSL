import { describe, expect, it } from "vitest";
import { makeDedupeKey, normalizeQso } from "../src";

const fixture = (time_on: string) =>
  normalizeQso({
    station_callsign: "BA4RC",
    call: "BG4YYY",
    qso_date: "20260903",
    time_on,
    band: "40m",
    mode: "SSB"
  });

describe("QSO dedupe key", () => {
  it("is stable for casing and unrelated ADIF extras", async () => {
    const a = fixture("143000");
    const b = normalizeQso({ ...fixture("143000"), adif_extra: { TEST: "one" } });
    expect(await makeDedupeKey(a)).toBe(await makeDedupeKey(b));
  });

  it("changes when identity fields change", async () => {
    expect(await makeDedupeKey(fixture("143000"))).not.toBe(await makeDedupeKey(fixture("143100")));
  });
});
