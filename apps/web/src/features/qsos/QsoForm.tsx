import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";
import {
  COMMON_BANDS,
  TOP_10_DEFAULT_FREQS,
  getBandFromFreq,
  getDefaultFreqForBand,
  getStoredFreqHistory,
  saveFreqToHistory
} from "./frequency-helpers";

export const DEFAULT_STATION_CALLSIGN = "BI4BVN";
const LEGACY_DEFAULT_STATION_CALLSIGNS = new Set(["", "BI1ABC"]);
const QUICK_MODES = ["SSB", "FM", "CW", "AM", "RTTY"];

type QsoFormValue = {
  id?: number;
  call: string;
  station_callsign: string;
  qso_date: string;
  time_on: string;
  band: string;
  freq_mhz?: string | null;
  mode: string;
  rst_sent?: string | null;
  rst_rcvd?: string | null;
  qth?: string | null;
  my_rig?: string | null;
  my_antenna?: string | null;
  my_power_w?: number | null;
  other_power_w?: number | null;
  comment?: string | null;
};

type QsoFormApi = {
  patch: (id: number, patch: Record<string, unknown>, etag: string) => Promise<unknown>;
  create?: (input: Record<string, unknown>) => Promise<unknown>;
};

type StationProfile = {
  callsign: string;
  rig?: string | null;
  antenna?: string | null;
  power_w?: number | null;
  is_default?: boolean | number;
};

type TimeMode = "utc" | "local";

export function getCurrentUtcDateTime(): { qso_date: string; time_on: string } {
  return formatDateParts(new Date(), true);
}

export function getCurrentLocalDateTime(): { qso_date: string; time_on: string } {
  return formatDateParts(new Date(), false);
}

function formatDateParts(date: Date, utc: boolean): { qso_date: string; time_on: string } {
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = utc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  return {
    qso_date: `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`,
    time_on: `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}`
  };
}

function parseDateTimeParts(qsoDate: string, timeOn: string): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } | null {
  if (!/^\d{8}$/u.test(qsoDate) || !/^\d{4}(?:\d{2})?$/u.test(timeOn)) return null;
  return {
    year: Number(qsoDate.slice(0, 4)),
    month: Number(qsoDate.slice(4, 6)),
    day: Number(qsoDate.slice(6, 8)),
    hours: Number(timeOn.slice(0, 2)),
    minutes: Number(timeOn.slice(2, 4)),
    seconds: timeOn.length === 6 ? Number(timeOn.slice(4, 6)) : 0
  };
}

function convertToUtc(qsoDate: string, timeOn: string, mode: TimeMode): { qso_date: string; time_on: string } {
  if (mode === "utc") return { qso_date: qsoDate, time_on: timeOn.length === 4 ? `${timeOn}00` : timeOn };
  const parts = parseDateTimeParts(qsoDate, timeOn);
  if (!parts) return { qso_date: qsoDate, time_on: timeOn };
  return formatDateParts(new Date(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, parts.seconds), true);
}

function convertBetweenModes(qsoDate: string, timeOn: string, from: TimeMode, to: TimeMode): { qso_date: string; time_on: string } {
  if (from === to) return { qso_date: qsoDate, time_on: timeOn };
  const utc = convertToUtc(qsoDate, timeOn, from);
  const parts = parseDateTimeParts(utc.qso_date, utc.time_on);
  if (!parts) return utc;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, parts.seconds));
  return formatDateParts(date, to === "utc");
}

const STATION_STORAGE_KEY = "myqsl_station_callsign";

export function getStoredStationCallsign(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STATION_STORAGE_KEY)?.trim().toUpperCase() ?? null;
    return stored && !LEGACY_DEFAULT_STATION_CALLSIGNS.has(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveStationCallsign(call: string): void {
  if (typeof window === "undefined" || !call.trim()) return;
  try {
    localStorage.setItem(STATION_STORAGE_KEY, call.trim().toUpperCase());
  } catch {}
}

function initialFormValue(initial: QsoFormValue): QsoFormValue {
  const utc = getCurrentUtcDateTime();
  const initialBand = initial.band || "";
  let initialFreq = initial.freq_mhz ?? "";
  if (!initialFreq && initialBand) initialFreq = getDefaultFreqForBand(initialBand) ?? "";
  const storedStation = getStoredStationCallsign();
  const initialStation = initial.station_callsign?.trim().toUpperCase() ?? "";
  const effectiveStation = LEGACY_DEFAULT_STATION_CALLSIGNS.has(initialStation)
    ? (storedStation || DEFAULT_STATION_CALLSIGN)
    : initialStation;
  return {
    ...initial,
    station_callsign: effectiveStation,
    band: initialBand,
    freq_mhz: initialFreq,
    qso_date: initial.qso_date || utc.qso_date,
    time_on: initial.time_on || utc.time_on,
    rst_sent: initial.rst_sent ?? null,
    rst_rcvd: initial.rst_rcvd ?? null,
    qth: initial.qth ?? null,
    my_rig: initial.my_rig ?? null,
    my_antenna: initial.my_antenna ?? null,
    my_power_w: initial.my_power_w ?? null,
    other_power_w: initial.other_power_w ?? null,
    comment: initial.comment ?? null
  };
}

function parsePower(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function QsoForm({ initial, etag, api: formApi = api.qsos, onSaved }: { initial: QsoFormValue; etag?: string; api?: QsoFormApi; onSaved?: () => void }) {
  const { t, locale } = useI18n();
  const [stationProfiles, setStationProfiles] = useState<StationProfile[]>([]);
  const [freqHistory, setFreqHistory] = useState<string[]>(() => getStoredFreqHistory());
  const [value, setValue] = useState<QsoFormValue>(() => initialFormValue(initial));
  const [timeMode, setTimeMode] = useState<TimeMode>("utc");
  const [message, setMessage] = useState<string | null>(null);
  const isEditing = Boolean(value.id && etag);

  const stationOptions = useMemo(() => stationProfiles.map((station) => station.callsign.toUpperCase()), [stationProfiles]);
  const modeOptions = useMemo(() => {
    const current = value.mode.trim().toUpperCase();
    return current && !QUICK_MODES.includes(current) ? [...QUICK_MODES, current] : QUICK_MODES;
  }, [value.mode]);

  useEffect(() => {
    if (initial.id) {
      setValue(initialFormValue(initial));
      setTimeMode("utc");
    }
  }, [initial.id]);

  useEffect(() => {
    if (isEditing) return;
    api.stations.list().then((res) => {
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : [];
      const profiles: StationProfile[] = list
        .filter((station) => Boolean(station && typeof station.callsign === "string"))
        .map((station) => ({
          callsign: station.callsign.trim().toUpperCase(),
          rig: station.rig ?? null,
          antenna: station.antenna ?? null,
          power_w: station.power_w ?? null,
          is_default: station.is_default
        }));
      setStationProfiles(profiles);
      const stored = getStoredStationCallsign();
      const selectedCallsign = stored || (value.station_callsign !== DEFAULT_STATION_CALLSIGN ? value.station_callsign : "");
      const selected = profiles.find((station) => station.callsign === selectedCallsign)
        ?? (stored ? profiles.find((station) => Boolean(station.is_default)) : undefined)
        ?? profiles.find((station) => station.callsign === DEFAULT_STATION_CALLSIGN);
      if (selected) {
        setValue((prev) => ({
          ...prev,
          station_callsign: prev.station_callsign === DEFAULT_STATION_CALLSIGN || !prev.station_callsign ? selected.callsign : prev.station_callsign,
          my_rig: prev.my_rig ?? selected.rig ?? null,
          my_antenna: prev.my_antenna ?? selected.antenna ?? null,
          my_power_w: prev.my_power_w ?? selected.power_w ?? null
        }));
      }
    }).catch(() => {});
  }, [isEditing]);

  const handleFreqChange = (newFreq: string) => {
    const detectedBand = getBandFromFreq(newFreq);
    setValue((prev) => ({ ...prev, freq_mhz: newFreq, band: detectedBand ? detectedBand : prev.band }));
  };

  const handleBandChange = (newBand: string) => {
    const trimmedBand = newBand.trim().toUpperCase();
    const currentFreqBand = value.freq_mhz ? getBandFromFreq(value.freq_mhz) : null;
    const nextFreq = !value.freq_mhz || currentFreqBand !== trimmedBand ? getDefaultFreqForBand(trimmedBand) ?? value.freq_mhz : value.freq_mhz;
    setValue((prev) => ({ ...prev, band: newBand, freq_mhz: nextFreq }));
  };

  const updateTimeMode = (nextMode: TimeMode) => {
    setValue((prev) => ({ ...prev, ...convertBetweenModes(prev.qso_date, prev.time_on, timeMode, nextMode) }));
    setTimeMode(nextMode);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const utcDateTime = convertToUtc(value.qso_date, value.time_on, timeMode);
    try {
      if (value.station_callsign?.trim()) saveStationCallsign(value.station_callsign);
      if (value.freq_mhz?.trim()) setFreqHistory(saveFreqToHistory(value.freq_mhz));

      if (isEditing && value.id && etag) {
        const patchPayload: Record<string, unknown> = {
          band: value.band,
          mode: value.mode,
          freq_mhz: value.freq_mhz?.trim() ? value.freq_mhz.trim() : null,
          rst_sent: value.rst_sent?.trim() || null,
          rst_rcvd: value.rst_rcvd?.trim() || null,
          qth: value.qth?.trim() || null,
          my_rig: value.my_rig?.trim() || null,
          my_antenna: value.my_antenna?.trim() || null,
          my_power_w: value.my_power_w ?? null,
          other_power_w: value.other_power_w ?? null,
          comment: value.comment ?? null
        };
        await formApi.patch(value.id, patchPayload, etag);
      } else if (formApi.create) {
        await formApi.create({
          ...value,
          call: value.call.trim().toUpperCase(),
          station_callsign: value.station_callsign.trim().toUpperCase(),
          qso_date: utcDateTime.qso_date,
          time_on: utcDateTime.time_on.length === 4 ? `${utcDateTime.time_on}00` : utcDateTime.time_on,
          freq_mhz: value.freq_mhz?.trim() ? value.freq_mhz.trim() : null,
          rst_sent: value.rst_sent?.trim() || null,
          rst_rcvd: value.rst_rcvd?.trim() || null,
          qth: value.qth?.trim() || null,
          my_rig: value.my_rig?.trim() || null,
          my_antenna: value.my_antenna?.trim() || null,
          my_power_w: value.my_power_w ?? null,
          other_power_w: value.other_power_w ?? null,
          comment: value.comment ?? null
        });
        const nextTime = timeMode === "local" ? getCurrentLocalDateTime() : getCurrentUtcDateTime();
        setValue((prev) => ({ ...prev, call: "", qso_date: nextTime.qso_date, time_on: nextTime.time_on }));
      }
      setMessage(locale === "zh" ? "已保存" : "Saved");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (locale === "zh" ? "保存失败" : "Failed to save"));
    }
  };

  const callLabel = locale === "zh" ? "对方呼号" : t("qsos.call");
  const stationLabel = locale === "zh" ? "本台呼号" : t("qsos.stationCallsign");
  const dateLabel = timeMode === "local" ? (locale === "zh" ? "本地日期" : "Local date") : (locale === "zh" ? "UTC 日期" : t("qsos.date"));
  const timeLabel = timeMode === "local" ? (locale === "zh" ? "本地时间" : "Local time") : (locale === "zh" ? "UTC 时间" : t("qsos.time"));
  const bandLabel = locale === "zh" ? "波段" : t("qsos.band");
  const freqLabel = locale === "zh" ? "频率 (MHz)" : t("qsos.freq");
  const modeLabel = locale === "zh" ? "模式" : t("qsos.mode");
  const saveLabel = locale === "zh" ? "保存" : t("common.save");

  return (
    <form className="qso-form" onSubmit={submit} aria-label={locale === "zh" ? "QSO 表单" : "QSO Form"}>
      <section className="qso-form-section" aria-labelledby="qso-core-heading">
        <div className="qso-form-section-heading">
          <div><p className="eyebrow">CONTACT</p><h3 id="qso-core-heading">{locale === "zh" ? "通联核心信息" : "Contact details"}</h3></div>
          <div className="qso-time-mode" role="group" aria-label={locale === "zh" ? "时间显示模式" : "Time display mode"}>
            <button type="button" className={timeMode === "utc" ? "active" : ""} aria-pressed={timeMode === "utc"} onClick={() => updateTimeMode("utc")}>UTC</button>
            <button type="button" className={timeMode === "local" ? "active" : ""} aria-pressed={timeMode === "local"} onClick={() => updateTimeMode("local")}>LOCAL</button>
          </div>
        </div>
        <div className="qso-form-grid qso-core-grid">
          <div className="qso-field qso-field-call">
            <div className="qso-field-heading"><label htmlFor="qso-call-input">{callLabel}</label><span className="qso-external-links"><a href={value.call.trim() ? `https://www.qrz.com/db/${encodeURIComponent(value.call.trim().toUpperCase())}` : "https://www.qrz.com"} target="_blank" rel="noopener noreferrer">QRZ ↗</a><span>·</span><a href={value.call.trim() ? `https://www.eqsl.cc/qslcard/MemberProfile.cfm?Callsign=${encodeURIComponent(value.call.trim().toUpperCase())}` : "https://www.eqsl.cc"} target="_blank" rel="noopener noreferrer">eQSL ↗</a></span></div>
            <input id="qso-call-input" aria-label={callLabel} value={value.call} disabled={isEditing} onChange={(event) => setValue({ ...value, call: event.target.value })} required placeholder={locale === "zh" ? "例如 BG4YYY" : "e.g. BG4YYY"} />
          </div>
          <div className="qso-field"><label htmlFor="qso-station-input">{stationLabel}</label><input id="qso-station-input" aria-label={stationLabel} value={value.station_callsign} disabled={isEditing} onChange={(event) => setValue({ ...value, station_callsign: event.target.value.toUpperCase() })} required list="station-callsign-options" placeholder={DEFAULT_STATION_CALLSIGN} />{stationOptions.length > 0 && <datalist id="station-callsign-options">{stationOptions.map((callsign) => <option key={callsign} value={callsign} />)}</datalist>}</div>
          <div className="qso-field"><div className="qso-field-heading"><label htmlFor="qso-date-input">{dateLabel}</label>{!isEditing && <button type="button" className="qso-inline-button" onClick={() => { const now = timeMode === "local" ? getCurrentLocalDateTime() : getCurrentUtcDateTime(); setValue((prev) => ({ ...prev, ...now })); }}>{locale === "zh" ? (timeMode === "utc" ? "当前 UTC" : "当前本地") : "Now"}</button>}</div><input id="qso-date-input" aria-label={dateLabel} type="text" value={value.qso_date} disabled={isEditing} onChange={(event) => setValue({ ...value, qso_date: event.target.value })} required placeholder="YYYYMMDD" /></div>
          <div className="qso-field"><label htmlFor="qso-time-input">{timeLabel}</label><input id="qso-time-input" aria-label={timeLabel} type="text" value={value.time_on} disabled={isEditing} onChange={(event) => setValue({ ...value, time_on: event.target.value })} required placeholder="HHMMSS" /></div>
          <div className="qso-field qso-field-mode"><label htmlFor="qso-mode-input">{modeLabel}</label><div className="mode-chip-list" role="group" aria-label={locale === "zh" ? "快捷模式" : "Quick modes"}>{modeOptions.map((mode) => <button type="button" className={`mode-chip ${value.mode.trim().toUpperCase() === mode ? "active" : ""}`} aria-pressed={value.mode.trim().toUpperCase() === mode} key={mode} onClick={() => setValue({ ...value, mode })}>{mode}</button>)}</div><input id="qso-mode-input" aria-label={modeLabel} value={value.mode} onChange={(event) => setValue({ ...value, mode: event.target.value })} required placeholder={locale === "zh" ? "也可输入 FT8 等自定义模式" : "Or enter a custom mode such as FT8"} /></div>
          <div className="qso-field"><label htmlFor="qso-band-input">{bandLabel}</label><input id="qso-band-input" aria-label={bandLabel} list="band-presets-list" value={value.band} onChange={(event) => handleBandChange(event.target.value)} required placeholder={locale === "zh" ? "例如 20M, 40M, 70CM" : "e.g. 20M, 40M, 70CM"} /><datalist id="band-presets-list">{COMMON_BANDS.map((band) => <option key={band.band} value={band.band}>{band.label}</option>)}</datalist><select aria-label={locale === "zh" ? "选择常用波段" : "Select Common Band"} value={COMMON_BANDS.some((band) => band.band.toUpperCase() === value.band.trim().toUpperCase()) ? value.band.trim().toUpperCase() : ""} onChange={(event) => event.target.value && handleBandChange(event.target.value)}><option value="">{locale === "zh" ? "快捷选择波段" : "Quick select band"}</option>{COMMON_BANDS.map((band) => <option key={`band-opt-${band.band}`} value={band.band}>{band.label}</option>)}</select></div>
          <div className="qso-field"><div className="qso-field-heading"><label htmlFor="qso-freq-input">{freqLabel}</label>{value.freq_mhz && <span className="qso-field-hint">{getBandFromFreq(value.freq_mhz) ? `→ ${getBandFromFreq(value.freq_mhz)}` : ""}</span>}</div><input id="qso-freq-input" aria-label={freqLabel} list="frequency-presets-list" type="text" value={value.freq_mhz ?? ""} onChange={(event) => handleFreqChange(event.target.value)} placeholder={t("qsos.freqPlaceholder")} /><datalist id="frequency-presets-list">{TOP_10_DEFAULT_FREQS.map((preset) => <option key={preset.freq} value={preset.freq}>{preset.label}</option>)}{freqHistory.map((freq) => <option key={`hist-${freq}`} value={freq}>{freq} MHz</option>)}</datalist><select aria-label={t("qsos.freqSelect")} value={value.freq_mhz ?? ""} onChange={(event) => event.target.value && handleFreqChange(event.target.value)}><option value="">{locale === "zh" ? "快捷选择常用/历史频率" : "Quick select frequency"}</option>{value.band && TOP_10_DEFAULT_FREQS.filter((preset) => preset.band.toUpperCase() === value.band.trim().toUpperCase()).length > 0 && <optgroup label={locale === "zh" ? `当前【${value.band.trim().toUpperCase()}】波段频点` : `Frequencies for ${value.band.trim().toUpperCase()}`}>{TOP_10_DEFAULT_FREQS.filter((preset) => preset.band.toUpperCase() === value.band.trim().toUpperCase()).map((preset) => <option key={`matched-${preset.freq}`} value={preset.freq}>{preset.label}</option>)}</optgroup>}{<optgroup label={locale === "zh" ? "全部常用中继与推荐频点" : "Common repeaters and frequencies"}>{TOP_10_DEFAULT_FREQS.map((preset) => <option key={`select-${preset.freq}`} value={preset.freq}>{preset.label}</option>)}</optgroup>}{freqHistory.filter((freq) => !TOP_10_DEFAULT_FREQS.some((preset) => preset.freq === freq)).length > 0 && <optgroup label={locale === "zh" ? "我的历史输入" : "My history"}>{freqHistory.filter((freq) => !TOP_10_DEFAULT_FREQS.some((preset) => preset.freq === freq)).map((freq) => <option key={`select-hist-${freq}`} value={freq}>{freq} MHz</option>)}</optgroup>}</select></div>
        </div>
      </section>

      <section className="qso-form-section" aria-labelledby="qso-signal-heading">
        <div className="qso-form-section-heading"><div><p className="eyebrow">SIGNAL & STATION</p><h3 id="qso-signal-heading">{locale === "zh" ? "信号与设备信息" : "Signal and station details"}</h3></div></div>
        <div className="qso-form-grid qso-detail-grid">
          <div className="qso-field"><label htmlFor="qso-rst-rcvd-input">{locale === "zh" ? "收信信号报告" : t("qsos.rstRcvd")}</label><input id="qso-rst-rcvd-input" aria-label={locale === "zh" ? "收信信号报告" : t("qsos.rstRcvd")} value={value.rst_rcvd ?? ""} onChange={(event) => setValue({ ...value, rst_rcvd: event.target.value })} placeholder="59 / -12" /></div>
          <div className="qso-field"><label htmlFor="qso-rst-sent-input">{locale === "zh" ? "发信信号报告" : t("qsos.rstSent")}</label><input id="qso-rst-sent-input" aria-label={locale === "zh" ? "发信信号报告" : t("qsos.rstSent")} value={value.rst_sent ?? ""} onChange={(event) => setValue({ ...value, rst_sent: event.target.value })} placeholder="59 / -10" /></div>
          <div className="qso-field"><label htmlFor="qso-my-power-input">{locale === "zh" ? "本台功率" : "My power"}</label><div className="qso-input-with-suffix"><input id="qso-my-power-input" aria-label={locale === "zh" ? "本台功率" : "My power"} type="number" min="0" max="100000" step="1" value={value.my_power_w ?? ""} onChange={(event) => setValue({ ...value, my_power_w: parsePower(event.target.value) })} placeholder="10" /><span>W</span></div></div>
          <div className="qso-field"><label htmlFor="qso-other-power-input">{locale === "zh" ? "对方功率" : "Other power"}</label><div className="qso-input-with-suffix"><input id="qso-other-power-input" aria-label={locale === "zh" ? "对方功率" : "Other power"} type="number" min="0" max="100000" step="1" value={value.other_power_w ?? ""} onChange={(event) => setValue({ ...value, other_power_w: parsePower(event.target.value) })} placeholder="100" /><span>W</span></div></div>
          <div className="qso-field"><label htmlFor="qso-qth-input">{locale === "zh" ? "对方QTH" : "Other QTH"}</label><input id="qso-qth-input" aria-label={locale === "zh" ? "对方QTH" : "Other QTH"} value={value.qth ?? ""} onChange={(event) => setValue({ ...value, qth: event.target.value })} placeholder={locale === "zh" ? "例如 上海" : "e.g. Shanghai"} /></div>
          <div className="qso-field"><label htmlFor="qso-rig-input">{locale === "zh" ? "设备型号" : "Rig"}</label><input id="qso-rig-input" aria-label={locale === "zh" ? "设备型号" : "Rig"} value={value.my_rig ?? ""} onChange={(event) => setValue({ ...value, my_rig: event.target.value })} placeholder="IC-705" /></div>
          <div className="qso-field"><label htmlFor="qso-antenna-input">{locale === "zh" ? "天线" : "Antenna"}</label><input id="qso-antenna-input" aria-label={locale === "zh" ? "天线" : "Antenna"} value={value.my_antenna ?? ""} onChange={(event) => setValue({ ...value, my_antenna: event.target.value })} placeholder="EFHW" /></div>
          <div className="qso-field qso-field-comment"><label htmlFor="qso-comment-input">{locale === "zh" ? "备注" : t("qsos.comment")}</label><textarea id="qso-comment-input" aria-label={locale === "zh" ? "备注" : t("qsos.comment")} rows={2} value={value.comment ?? ""} onChange={(event) => setValue({ ...value, comment: event.target.value })} placeholder={locale === "zh" ? "可选备注" : "Optional notes"} /></div>
        </div>
      </section>

      <div className="qso-form-actions"><button type="submit" className="primary-button">{saveLabel}</button>{message && <output role="status" className={message.includes("失败") || message.includes("Failed") || message.includes("changed") || message.includes("Stale") ? "qso-message error" : "qso-message success"}>{message}</output>}</div>
    </form>
  );
}
