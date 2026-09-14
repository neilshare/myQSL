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

  it("normalizes operator and counterpart operating details", () => {
    const qso = normalizeQso({
      station_callsign: "BI4BVN",
      call: "BG4YYY",
      qso_date: "20260914",
      time_on: "1430",
      band: "20M",
      mode: "SSB",
      my_rig: "  IC-705 ",
      my_antenna: "  EFHW ",
      my_power_w: 10,
      other_power_w: 50,
      qth: "  Shanghai  "
    });
    expect(qso.my_rig).toBe("IC-705");
    expect(qso.my_antenna).toBe("EFHW");
    expect(qso.my_power_w).toBe(10);
    expect(qso.other_power_w).toBe(50);
    expect(qso.qth).toBe("Shanghai");
  });

  it("rejects negative or implausibly large power values", () => {
    const base = {
      station_callsign: "BI4BVN",
      call: "BG4YYY",
      qso_date: "20260914",
      time_on: "1430",
      band: "20M",
      mode: "SSB"
    };
    expect(() => normalizeQso({ ...base, my_power_w: -1 })).toThrow();
    expect(() => normalizeQso({ ...base, other_power_w: 100001 })).toThrow();
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
    expect(patch.my_rig).toBeUndefined();
    expect(patch.my_antenna).toBeUndefined();
    expect(patch.my_power_w).toBeUndefined();
    expect(patch.other_power_w).toBeUndefined();
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

  it("normalizes operating detail patches", () => {
    const patch = normalizeQsoPatch({ my_rig: " IC-705 ", my_antenna: " EFHW ", my_power_w: 10, other_power_w: 5 });
    expect(patch.my_rig).toBe("IC-705");
    expect(patch.my_antenna).toBe("EFHW");
    expect(patch.my_power_w).toBe(10);
    expect(patch.other_power_w).toBe(5);
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
