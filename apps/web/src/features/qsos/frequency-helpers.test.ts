import { describe, expect, it, beforeEach } from "vitest";
import {
  TOP_10_DEFAULT_FREQS,
  getBandFromFreq,
  getDefaultFreqForBand,
  getStoredFreqHistory,
  saveFreqToHistory
} from "./frequency-helpers";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true
  });
}

describe("frequency-helpers", () => {
  beforeEach(() => {
    storageMock.clear();
  });

  it("defines default common frequencies covering U/V/40M/20M with top 3 at the very top", () => {
    expect(TOP_10_DEFAULT_FREQS).toHaveLength(13);
    expect(TOP_10_DEFAULT_FREQS[0].freq).toBe("145.775");
    expect(TOP_10_DEFAULT_FREQS[1].freq).toBe("145.725");
    expect(TOP_10_DEFAULT_FREQS[2].freq).toBe("145.1");

    const freqs = TOP_10_DEFAULT_FREQS.map((p) => p.freq);
    expect(freqs).toContain("438.500");
    expect(freqs).toContain("439.750");
    expect(freqs).toContain("145.000");
    expect(freqs).toContain("7.050");
    expect(freqs).toContain("14.270");
  });

  it("maps frequencies to the correct amateur bands bidirectionally", () => {
    expect(getBandFromFreq("145.775")).toBe("2M");
    expect(getBandFromFreq("145.725")).toBe("2M");
    expect(getBandFromFreq("145.1")).toBe("2M");
    expect(getBandFromFreq("438.500")).toBe("70CM");
    expect(getBandFromFreq("439.750")).toBe("70CM");
    expect(getBandFromFreq("145.000")).toBe("2M");
    expect(getBandFromFreq("144.800")).toBe("2M");
    expect(getBandFromFreq("7.050")).toBe("40M");
    expect(getBandFromFreq("14.270")).toBe("20M");
    expect(getBandFromFreq("21.200")).toBe("15M");
    expect(getBandFromFreq("28.500")).toBe("10M");
    expect(getBandFromFreq("50.110")).toBe("6M");
    expect(getBandFromFreq("0.500")).toBeNull();
    expect(getBandFromFreq("invalid")).toBeNull();

    expect(getDefaultFreqForBand("70CM")).toBe("438.500");
    expect(getDefaultFreqForBand("U段")).toBe("438.500");
    expect(getDefaultFreqForBand("2M")).toBe("145.000");
    expect(getDefaultFreqForBand("V段")).toBe("145.000");
    expect(getDefaultFreqForBand("40M")).toBe("7.050");
    expect(getDefaultFreqForBand("20M")).toBe("14.270");
    expect(getDefaultFreqForBand("15M")).toBe("21.200");
    expect(getDefaultFreqForBand("UNKNOWN")).toBeNull();
  });

  it("persists frequency history in localStorage and dedupes entries", () => {
    expect(getStoredFreqHistory()).toEqual([]);

    saveFreqToHistory("438.500");
    saveFreqToHistory("14.270");
    saveFreqToHistory("438.500"); // duplicate should move to front

    const history = getStoredFreqHistory();
    expect(history).toEqual(["438.500", "14.270"]);

    // Invalid frequencies ignored
    saveFreqToHistory("not-a-number");
    expect(getStoredFreqHistory()).toEqual(["438.500", "14.270"]);
  });
});
