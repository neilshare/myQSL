import { describe, expect, it } from "vitest";
import { decodeN1mm } from "../src/index";

const bytes = (xml: string) => new TextEncoder().encode(xml);

describe("N1MM UDP XML", () => {
  it("maps contact frequency in 10 Hz units and localizes the band", () => {
    const packet = decodeN1mm(bytes(`<contactinfo><timestamp>2026-09-06 01:02:03</timestamp><mycall>BA1ABC</mycall><band>14</band><txfreq>1407400</txfreq><mode>USB</mode><call>K1ABC</call><snt>59</snt><rcv>-07</rcv><ID>id-1</ID></contactinfo>`));
    expect(packet.kind).toBe("qso_logged");
    expect(packet.qso).toMatchObject({ station_callsign: "BA1ABC", call: "K1ABC", band: "20M", mode: "SSB", freq_mhz: "14.074000", rst_rcvd: "-07" });
  });

  it("keeps external edits out of automatic QSO CRUD", () => {
    expect(decodeN1mm(bytes(`<contactdelete><timestamp>2026-09-06 01:02:03</timestamp><ID>id-1</ID></contactdelete>`)).eventKind).toBe("external_delete");
    expect(decodeN1mm(bytes(`<contactreplace><timestamp>2026-09-06 01:02:03</timestamp><mycall>BA1ABC</mycall><band>14</band><txfreq>1407400</txfreq><mode>CW</mode><call>K1ABC</call><ID>id-1</ID></contactreplace>`)).kind).toBe("external_replace");
  });

  it("rejects entities and invalid calendar values", () => {
    expect(() => decodeN1mm(bytes(`<!DOCTYPE x [<!ENTITY x SYSTEM "file:///tmp/x">]><contactinfo/>`))).toThrow();
    expect(() => decodeN1mm(bytes(`<contactinfo><timestamp>2026-02-31 01:02:03</timestamp><mycall>BA1ABC</mycall><band>14</band><txfreq>1407400</txfreq><mode>CW</mode><call>K1ABC</call></contactinfo>`))).toThrow(/calendar/);
  });
});
