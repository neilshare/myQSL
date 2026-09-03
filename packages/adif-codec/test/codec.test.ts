import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdif, serializeAdif } from "../src";

describe("ADIF codec", () => {
  it("preserves unknown fields semantically", () => {
    const source = readFileSync(new URL("./fixtures/unknown-fields.adi", import.meta.url), "utf8");
    const first = parseAdif(source);
    expect(first.errors).toEqual([]);
    expect(first.records[0].fields.IOTA).toBe("AS-136");
    expect(first.records[0].fields.APP_VENDOR_FLAG).toBe("PRESERVED-VALUE");
    const second = parseAdif(serializeAdif(first.records, { programId: "eQSR", adifVersion: "3.1.7" }));
    expect(second.records).toEqual(first.records);
  });

  it("reports a truncated length-prefixed value with line and offset", () => {
    const result = parseAdif("<CALL:8>BG4Y<EOR>");
    expect(result.errors[0]).toMatchObject({ code: "TRUNCATED_VALUE", offset: 0 });
  });

  it("refuses non-ASCII data instead of emitting an invalid ADI file", () => {
    expect(() => serializeAdif([{ fields: { NAME: "操作员" }, types: {} }], { programId: "eQSR", adifVersion: "3.1.7" })).toThrow(/NON_ASCII_ADI.*NAME/);
  });

  it("parses ten thousand records within a bounded memory footprint", () => {
    const source = Array.from({ length: 10_000 }, (_, index) => `<CALL:6>BG${String(index % 10000).padStart(4, "0")}<QSO_DATE:8>20260903<TIME_ON:6>143000<EOR>`).join("");
    const started = performance.now();
    const result = parseAdif(source);
    const duration = performance.now() - started;
    expect(result.records).toHaveLength(10_000);
    expect(duration).toBeLessThan(10_000);
  });
});
