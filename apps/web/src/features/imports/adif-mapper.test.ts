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
});
