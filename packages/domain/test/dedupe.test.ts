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

describe("isSoftDuplicate", () => {
  const base = {
    station_callsign: "BA4RC",
    call: "BG4YYY",
    qso_date: "20260903",
    time_on: "143000",
    band: "40M",
    mode: "SSB"
  };

  it("identifies records within +-180s as soft duplicates", async () => {
    const { isSoftDuplicate } = await import("../src");
    // exactly 180s after: 14:33:00
    expect(isSoftDuplicate(base, { ...base, time_on: "143300" })).toBe(true);
    // exactly 180s before: 14:27:00
    expect(isSoftDuplicate(base, { ...base, time_on: "142700" })).toBe(true);
    // 60s after: 14:31:00
    expect(isSoftDuplicate(base, { ...base, time_on: "143100" })).toBe(true);
  });

  it("rejects records beyond 180s window (>180s)", async () => {
    const { isSoftDuplicate } = await import("../src");
    // 181s after: 14:33:01
    expect(isSoftDuplicate(base, { ...base, time_on: "143301" })).toBe(false);
    // 181s before: 14:26:59
    expect(isSoftDuplicate(base, { ...base, time_on: "142659" })).toBe(false);
  });

  it("handles cross-midnight boundaries correctly", async () => {
    const { isSoftDuplicate } = await import("../src");
    const day1End = { ...base, qso_date: "20260903", time_on: "235930" };
    const day2Start = { ...base, qso_date: "20260904", time_on: "000100" };
    // 90s delta across midnight
    expect(isSoftDuplicate(day1End, day2Start)).toBe(true);

    const day2Later = { ...base, qso_date: "20260904", time_on: "000300" };
    // 210s delta across midnight (>180s)
    expect(isSoftDuplicate(day1End, day2Later)).toBe(false);
  });

  it("handles 4-digit time_on (HHMM)", async () => {
    const { isSoftDuplicate } = await import("../src");
    // 1430 vs 1432 is 120s delta
    expect(isSoftDuplicate({ ...base, time_on: "1430" }, { ...base, time_on: "1432" })).toBe(true);
    // 1430 vs 1434 is 240s delta
    expect(isSoftDuplicate({ ...base, time_on: "1430" }, { ...base, time_on: "1434" })).toBe(false);
  });

  it("requires matching call, station_callsign, band, mode", async () => {
    const { isSoftDuplicate } = await import("../src");
    expect(isSoftDuplicate(base, { ...base, call: "OTHER" })).toBe(false);
    expect(isSoftDuplicate(base, { ...base, station_callsign: "OTHER" })).toBe(false);
    expect(isSoftDuplicate(base, { ...base, band: "20M" })).toBe(false);
    expect(isSoftDuplicate(base, { ...base, mode: "CW" })).toBe(false);
    // Case-insensitive match
    expect(isSoftDuplicate(base, { ...base, call: "bg4yyy", band: "40m" })).toBe(true);
  });
});

