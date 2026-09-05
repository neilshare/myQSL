export interface FreqPreset {
  freq: string;
  band: string;
  label: string;
}

export const DEFAULT_FREQ_PRESETS: FreqPreset[] = [
  { freq: "145.775", band: "2M", label: "145.775 MHz (2M 常用中继频点)" },
  { freq: "145.725", band: "2M", label: "145.725 MHz (2M 常用中继频点)" },
  { freq: "145.1", band: "2M", label: "145.1 MHz (2M 常用频点/中继 145.100)" },
  { freq: "438.500", band: "70CM", label: "438.500 MHz (70CM 全国直频呼叫/日常守候)" },
  { freq: "439.750", band: "70CM", label: "439.750 MHz (70CM 经典中继下行 -5MHz 北京/华北)" },
  { freq: "439.460", band: "70CM", label: "439.460 MHz (70CM 骨干互联中继下行 -5MHz)" },
  { freq: "439.900", band: "70CM", label: "439.900 MHz (70CM 应急救援/省市中继下行 -5MHz)" },
  { freq: "434.750", band: "70CM", label: "434.750 MHz (70CM 常用中继上行频点)" },
  { freq: "145.000", band: "2M", label: "145.000 MHz (2M 全国直频呼叫/应急守候)" },
  { freq: "144.800", band: "2M", label: "144.800 MHz (2M 全国 APRS 数据与定位)" },
  { freq: "147.500", band: "2M", label: "147.500 MHz (2M 经典 VHF 中继频点)" },
  { freq: "7.050", band: "40M", label: "7.050 MHz (40M 短波华语通联常用频点 LSB)" },
  { freq: "14.270", band: "20M", label: "14.270 MHz (20M 短波华语呼叫主频 USB)" }
];

export const TOP_10_DEFAULT_FREQS = DEFAULT_FREQ_PRESETS;

export const FREQ_STORAGE_KEY = "myqsl_freq_history";

export function getStoredFreqHistory(): string[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(FREQ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        }
      }
    }
  } catch {}
  return [];
}

export function saveFreqToHistory(freq: string): string[] {
  const trimmed = freq.trim();
  if (!trimmed || !/^\d{1,5}(?:\.\d{1,6})?$/.test(trimmed)) {
    return getStoredFreqHistory();
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const existing = getStoredFreqHistory();
      const updated = [trimmed, ...existing.filter((f) => f !== trimmed)].slice(0, 30);
      window.localStorage.setItem(FREQ_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    }
  } catch {}
  return [];
}

export function getBandFromFreq(freqStr: string): string | null {
  const f = parseFloat(freqStr);
  if (isNaN(f) || f <= 0) return null;

  if (f >= 1.8 && f <= 2.0) return "160M";
  if (f >= 3.5 && f <= 4.0) return "80M";
  if (f >= 5.0 && f <= 5.5) return "60M";
  if (f >= 7.0 && f <= 7.3) return "40M";
  if (f >= 10.1 && f <= 10.15) return "30M";
  if (f >= 14.0 && f <= 14.35) return "20M";
  if (f >= 18.068 && f <= 18.168) return "17M";
  if (f >= 21.0 && f <= 21.45) return "15M";
  if (f >= 24.89 && f <= 24.99) return "12M";
  if (f >= 28.0 && f <= 29.7) return "10M";
  if (f >= 50.0 && f <= 54.0) return "6M";
  if (f >= 144.0 && f <= 148.0) return "2M";
  if (f >= 222.0 && f <= 225.0) return "1.25M";
  if (f >= 430.0 && f <= 440.0) return "70CM";
  if (f >= 1240.0 && f <= 1300.0) return "23CM";

  return null;
}

export function getDefaultFreqForBand(bandStr: string): string | null {
  const b = bandStr.trim().toUpperCase();
  switch (b) {
    case "160M":
      return "1.850";
    case "80M":
      return "3.750";
    case "60M":
      return "5.357";
    case "40M":
      return "7.050";
    case "30M":
      return "10.136";
    case "20M":
      return "14.270";
    case "17M":
      return "18.100";
    case "15M":
      return "21.200";
    case "12M":
      return "24.915";
    case "10M":
      return "28.500";
    case "6M":
      return "50.110";
    case "2M":
    case "V段":
    case "VHF":
      return "145.000";
    case "70CM":
    case "U段":
    case "UHF":
      return "438.500";
    case "23CM":
      return "1296.000";
    default:
      return null;
  }
}

export const COMMON_BANDS = [
  { band: "2M", label: "2M (144-148 MHz / V段)" },
  { band: "70CM", label: "70CM (430-440 MHz / U段)" },
  { band: "40M", label: "40M (7.0-7.3 MHz 短波)" },
  { band: "20M", label: "20M (14.0-14.35 MHz 短波)" },
  { band: "15M", label: "15M (21.0-21.45 MHz 短波)" },
  { band: "10M", label: "10M (28.0-29.7 MHz 短波)" },
  { band: "6M", label: "6M (50-54 MHz 魔法波段)" },
  { band: "80M", label: "80M (3.5-4.0 MHz 短波)" },
  { band: "160M", label: "160M (1.8-2.0 MHz 顶波)" },
  { band: "1.25M", label: "1.25M (222-225 MHz)" },
  { band: "23CM", label: "23CM (1240-1300 MHz 微波)" }
];

