import { describe, expect, it } from "vitest";
import { exportAdif } from "./export-controller";

describe("exportAdif", () => {
  it("serializes paginated rows into a downloadable ADIF string", async () => {
    const output = await exportAdif({ list: async () => ({ data: [{ call: "BG4YYY", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" }], next_cursor: null }) });
    expect(output).toContain("<CALL:6>BG4YYY");
    expect(output).toContain("<EOR>");
  });

  it("unpacks adif_extra losslessly and avoids [object Object]", async () => {
    const output = await exportAdif({
      list: async () => ({
        data: [
          {
            call: "BG4YYY",
            station_callsign: "BA4RC",
            qso_date: "20260903",
            time_on: "143000",
            band: "40M",
            mode: "SSB",
            adif_extra: { IOTA: "AS-136", APP_EQSR_TEST: "1" }
          }
        ],
        next_cursor: null
      })
    });
    expect(output).toContain("<IOTA:6>AS-136");
    expect(output).toContain("<APP_EQSR_TEST:1>1");
    expect(output).not.toContain("[object Object]");
    expect(output).not.toContain("ADIF_EXTRA");
  });
});
