import { describe, expect, it } from "vitest";
import { recordToQso, qsoToAdifRecord } from "./adif-mapper";
import { serializeAdif } from "@myqsl/adif-codec";

describe("ADIF Semantic Mapper", () => {
  it("preserves non-core fields in adif_extra and converts back losslessly", () => {
    const originalRecord = {
      fields: {
        CALL: "BG4YYY",
        STATION_CALLSIGN: "BA4RC",
        QSO_DATE: "20260903",
        TIME_ON: "143000",
        BAND: "40M",
        MODE: "SSB",
        IOTA: "AS-136",
        APP_EQSR_TEST: "1",
        MY_RIG: "IC-705"
      },
      types: {}
    };

    const qso = recordToQso(originalRecord);
    expect(qso.call).toBe("BG4YYY");
    expect(qso.station_callsign).toBe("BA4RC");
    expect(qso.my_rig).toBe("IC-705");

    // adif_extra should strictly contain IOTA and APP_EQSR_TEST
    const extra = qso.adif_extra as Record<string, string>;
    expect(extra).toBeDefined();
    expect(extra.IOTA).toBe("AS-136");
    expect(extra.APP_EQSR_TEST).toBe("1");
    expect(extra.CALL).toBeUndefined();

    // Roundtrip back to AdifRecord
    const reconstructedRecord = qsoToAdifRecord(qso as any);
    expect(reconstructedRecord.fields.CALL).toBe("BG4YYY");
    expect(reconstructedRecord.fields.IOTA).toBe("AS-136");
    expect(reconstructedRecord.fields.APP_EQSR_TEST).toBe("1");
    expect(reconstructedRecord.fields.ADIF_EXTRA).toBeUndefined();

    // Serialize to string
    const adiString = serializeAdif([reconstructedRecord], { programId: "myQSL", adifVersion: "3.1.7" });
    expect(adiString).toContain("<IOTA:6>AS-136");
    expect(adiString).toContain("<APP_EQSR_TEST:1>1");
    expect(adiString).not.toContain("ADIF_EXTRA");
    expect(adiString).not.toContain("[object Object]");
  });

  it("preserves OPERATOR_CALLSIGN and non-core MY_* fields in adif_extra", () => {
    const originalRecord = {
      fields: {
        CALL: "BD4SSS",
        STATION_CALLSIGN: "BA4RC",
        OPERATOR_CALLSIGN: "BI4TEST",
        MY_SOTA_REF: "JA/NN-001",
        MY_GRID: "OM89aa",
        QSO_DATE: "20260904",
        TIME_ON: "100000",
        BAND: "20M",
        MODE: "CW",
        FREQ: "14.025"
      },
      types: {}
    };

    const qso = recordToQso(originalRecord);
    expect(qso.station_callsign).toBe("BA4RC");
    expect(qso.my_grid).toBe("OM89aa");

    const extra = qso.adif_extra as Record<string, string>;
    expect(extra.OPERATOR_CALLSIGN).toBe("BI4TEST");
    expect(extra.MY_SOTA_REF).toBe("JA/NN-001");

    const reconstructed = qsoToAdifRecord(qso as any);
    expect(reconstructed.fields.OPERATOR_CALLSIGN).toBe("BI4TEST");
    expect(reconstructed.fields.MY_SOTA_REF).toBe("JA/NN-001");
    expect(reconstructed.fields.MY_GRID).toBe("OM89aa");
    expect(reconstructed.fields.FREQ).toBe("14.025");
    expect(reconstructed.fields.FREQ_HZ).toBe("14025000");

    // Check key order: CALL, STATION_CALLSIGN should be first
    const keys = Object.keys(reconstructed.fields);
    expect(keys.indexOf("CALL")).toBeLessThan(keys.indexOf("FREQ"));
    expect(keys.indexOf("FREQ")).toBeLessThan(keys.indexOf("OPERATOR_CALLSIGN"));
  });

  it("handles FREQ_HZ to freq_mhz conversion and back", () => {
    const originalRecord = {
      fields: {
        CALL: "VR2ZZZ",
        STATION_CALLSIGN: "BA4RC",
        QSO_DATE: "20260905",
        TIME_ON: "080000",
        BAND: "2M",
        MODE: "FM",
        FREQ_HZ: "144125000"
      },
      types: {}
    };

    const qso = recordToQso(originalRecord);
    expect(qso.freq_mhz).toBe("144.125");

    const reconstructed = qsoToAdifRecord(qso as any);
    expect(reconstructed.fields.FREQ).toBe("144.125");
    expect(reconstructed.fields.FREQ_HZ).toBe("144125000");
  });
});
