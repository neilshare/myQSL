import { describe, expect, it } from "vitest";
import { makeDedupeKey, normalizeQso } from "../src";

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
