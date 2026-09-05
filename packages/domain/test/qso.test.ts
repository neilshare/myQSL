import { describe, expect, it } from "vitest";
import { makeDedupeKey, normalizeQso, normalizeQsoPatch } from "../src";

describe("QSO normalization", () => {
  it("uppercases calls and expands four-digit time without changing unknown ADIF", async () => {
    const qso = normalizeQso({
      station_callsign: " ba4rc ",
      call: "bg4yyy/p",
      qso_date: "20260903",
      time_on: "1430",
      band: "40m",
      mode: "ssb",
      submode: null,
      freq_mhz: "7.0500",
      rst_sent: "59",
      rst_rcvd: "59",
      adif_extra: { IOTA: "AS-136" }
    });
    expect(qso.call).toBe("BG4YYY/P");
    expect(qso.time_on).toBe("143000");
    expect(qso.freq_hz).toBe(7_050_000);
    expect(qso.adif_extra).toEqual({ IOTA: "AS-136" });
    expect(await makeDedupeKey(qso)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects malformed calls and dates", () => {
    expect(() =>
      normalizeQso({
        station_callsign: "BA4RC",
        call: "not a call",
        qso_date: "20260903",
        time_on: "1430",
        band: "40m",
        mode: "SSB"
      })
    ).toThrow();
  });
});

describe("QSO patch normalization", () => {
  it("leaves omitted fields as undefined without injecting defaults", () => {
    const patch = normalizeQsoPatch({
      comment: "  Preserve leading spaces  "
    });
    expect(patch.comment).toBe("  Preserve leading spaces  ");
    expect(patch.band).toBeUndefined();
    expect(patch.mode).toBeUndefined();
    expect(patch.submode).toBeUndefined();
    expect(patch.freq_mhz).toBeUndefined();
    expect(patch.freq_hz).toBeUndefined();
    expect(patch.rst_sent).toBeUndefined();
    expect(patch.rst_rcvd).toBeUndefined();
    expect(patch.gridsquare).toBeUndefined();
    expect(patch.name).toBeUndefined();
    expect(patch.qth).toBeUndefined();
    expect(patch.adif_extra).toBeUndefined();
  });

  it("converts freq_mhz string to freq_hz integer and supports null reset", () => {
    const patchWithFreq = normalizeQsoPatch({ freq_mhz: "14.225000" });
    expect(patchWithFreq.freq_mhz).toBe("14.225000");
    expect(patchWithFreq.freq_hz).toBe(14_225_000);

    const patchWithNullFreq = normalizeQsoPatch({ freq_mhz: null });
    expect(patchWithNullFreq.freq_mhz).toBeNull();
    expect(patchWithNullFreq.freq_hz).toBeNull();
  });

  it("normalizes band and mode to uppercase and supports adif_extra", () => {
    const patch = normalizeQsoPatch({
      band: " 20m ",
      mode: " cw ",
      submode: " rtty ",
      adif_extra: { PROP_MODE: "ES" }
    });
    expect(patch.band).toBe("20M");
    expect(patch.mode).toBe("CW");
    expect(patch.submode).toBe("RTTY");
    expect(patch.adif_extra).toEqual({ PROP_MODE: "ES" });
  });

  it("handles empty patch input", () => {
    const patch = normalizeQsoPatch({});
    expect(Object.keys(patch)).toHaveLength(0);
  });

  it("rejects unknown fields due to strict schema", () => {
    expect(() => {
      // @ts-expect-error testing strict schema
      normalizeQsoPatch({ unknown_field: "test" });
    }).toThrow();
  });

  it("accepts comment up to 2000 chars and rejects over 2000 chars", () => {
    const okComment = "A".repeat(2000);
    expect(normalizeQsoPatch({ comment: okComment }).comment).toHaveLength(2000);

    const badComment = "A".repeat(2001);
    expect(() => normalizeQsoPatch({ comment: badComment })).toThrow();
  });

  it("rejects invalid calendar dates such as Feb 31 or invalid time like hour 25", () => {
    expect(() =>
      normalizeQso({
        station_callsign: "BA4RC",
        call: "BG4YYY",
        qso_date: "20260231", // Feb 31 does not exist
        time_on: "1200",
        band: "40m",
        mode: "SSB"
      })
    ).toThrow(/Invalid calendar date/);

    expect(() =>
      normalizeQso({
        station_callsign: "BA4RC",
        call: "BG4YYY",
        qso_date: "20260101",
        time_on: "250000", // Hour 25 invalid
        band: "40m",
        mode: "SSB"
      })
    ).toThrow(/Invalid calendar date/);
  });
});
