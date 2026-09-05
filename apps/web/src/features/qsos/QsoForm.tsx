import { useState, useEffect, type FormEvent } from "react";
import { api } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";
import {
  TOP_10_DEFAULT_FREQS,
  getBandFromFreq,
  getDefaultFreqForBand,
  getStoredFreqHistory,
  saveFreqToHistory
} from "./frequency-helpers";

type QsoFormValue = {
  id?: number;
  call: string;
  station_callsign: string;
  qso_date: string;
  time_on: string;
  band: string;
  freq_mhz?: string | null;
  mode: string;
  comment?: string;
};
type QsoFormApi = { patch: (id: number, patch: Record<string, unknown>, etag: string) => Promise<unknown>; create?: (input: Record<string, unknown>) => Promise<unknown> };

export function getCurrentUtcDateTime(): { qso_date: string; time_on: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");

  return {
    qso_date: `${year}${month}${day}`,
    time_on: `${hours}${minutes}${seconds}`
  };
}

export function QsoForm({ initial, etag, api: formApi = api.qsos, onSaved }: { initial: QsoFormValue; etag?: string; api?: QsoFormApi; onSaved?: () => void }) {
  const { t, locale } = useI18n();
  const [freqHistory, setFreqHistory] = useState<string[]>(() => getStoredFreqHistory());
  const [value, setValue] = useState<QsoFormValue>(() => {
    const utc = getCurrentUtcDateTime();
    const initialBand = initial.band || "";
    let initialFreq = initial.freq_mhz ?? "";
    if (!initialFreq && initialBand) {
      initialFreq = getDefaultFreqForBand(initialBand) ?? "";
    }
    return {
      ...initial,
      band: initialBand,
      freq_mhz: initialFreq,
      qso_date: initial.qso_date || utc.qso_date,
      time_on: initial.time_on || utc.time_on
    };
  });
  const [message, setMessage] = useState<string | null>(null);
  const isEditing = Boolean(value.id && etag);

  useEffect(() => {
    if (initial.id) {
      setValue(initial);
    }
  }, [initial.id]);

  const handleFreqChange = (newFreq: string) => {
    const detectedBand = getBandFromFreq(newFreq);
    setValue((prev) => ({
      ...prev,
      freq_mhz: newFreq,
      band: detectedBand ? detectedBand : prev.band
    }));
  };

  const handleBandChange = (newBand: string) => {
    const trimmedBand = newBand.trim().toUpperCase();
    const currentFreqBand = value.freq_mhz ? getBandFromFreq(value.freq_mhz) : null;
    let nextFreq = value.freq_mhz;
    if (!value.freq_mhz || currentFreqBand !== trimmedBand) {
      const defaultFreq = getDefaultFreqForBand(trimmedBand);
      if (defaultFreq) {
        nextFreq = defaultFreq;
      }
    }
    setValue((prev) => ({
      ...prev,
      band: newBand,
      freq_mhz: nextFreq
    }));
  };

  const handleSelectFreq = (selectedFreq: string) => {
    if (!selectedFreq) return;
    handleFreqChange(selectedFreq);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (value.freq_mhz && value.freq_mhz.trim()) {
        const updated = saveFreqToHistory(value.freq_mhz);
        setFreqHistory(updated);
      }

      if (isEditing && value.id && etag) {
        const patchPayload: Record<string, unknown> = {
          band: value.band,
          mode: value.mode
        };
        if (value.comment !== undefined) patchPayload.comment = value.comment;
        if (value.freq_mhz !== undefined) patchPayload.freq_mhz = value.freq_mhz ? value.freq_mhz.trim() : null;
        await formApi.patch(value.id, patchPayload, etag);
      } else if (formApi.create) {
        const createPayload = {
          ...value,
          call: value.call.trim().toUpperCase(),
          time_on: value.time_on.length === 4 ? `${value.time_on}00` : value.time_on,
          freq_mhz: value.freq_mhz?.trim() ? value.freq_mhz.trim() : null
        };
        await formApi.create(createPayload);
        const nextUtc = getCurrentUtcDateTime();
        setValue((prev) => ({
          ...prev,
          call: "",
          qso_date: nextUtc.qso_date,
          time_on: nextUtc.time_on
        }));
      }
      setMessage(locale === "zh" ? "已保存" : "Saved");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (locale === "zh" ? "保存失败" : "Failed to save"));
    }
  };

  const callLabel = locale === "zh" ? "对方呼号" : t("qsos.call");
  const stationLabel = locale === "zh" ? "本台呼号" : t("qsos.stationCallsign");
  const dateLabel = locale === "zh" ? "UTC 日期" : t("qsos.date");
  const timeLabel = locale === "zh" ? "UTC 时间" : t("qsos.time");
  const bandLabel = locale === "zh" ? "波段" : t("qsos.band");
  const freqLabel = locale === "zh" ? "频率 (MHz)" : t("qsos.freq");
  const modeLabel = locale === "zh" ? "模式" : t("qsos.mode");
  const saveLabel = locale === "zh" ? "保存" : t("common.save");

  return (
    <form onSubmit={submit} aria-label={locale === "zh" ? "QSO 表单" : "QSO Form"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label htmlFor="qso-call-input" style={{ margin: 0, fontWeight: 500 }}>
              {callLabel}
            </label>
            <div style={{ display: "flex", gap: "0.35rem", fontSize: "0.75rem" }}>
              <a
                href={value.call.trim() ? `https://www.qrz.com/db/${encodeURIComponent(value.call.trim().toUpperCase())}` : "https://www.qrz.com"}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-primary)", textDecoration: "none" }}
                title={value.call.trim() ? `在 QRZ.com 查询 ${value.call.trim().toUpperCase()}` : "QRZ.com"}
              >
                QRZ ↗
              </a>
              <span style={{ color: "var(--border-subtle)" }}>·</span>
              <a
                href={value.call.trim() ? `https://www.eqsl.cc/qslcard/MemberProfile.cfm?Callsign=${encodeURIComponent(value.call.trim().toUpperCase())}` : "https://www.eqsl.cc"}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-primary)", textDecoration: "none" }}
                title={value.call.trim() ? `在 eQSL.cc 查询 ${value.call.trim().toUpperCase()}` : "eQSL.cc"}
              >
                eQSL ↗
              </a>
            </div>
          </div>
          <input
            id="qso-call-input"
            aria-label={callLabel}
            value={value.call}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, call: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 BG4YYY" : "e.g. BG4YYY"}
          />
        </div>
        <label>
          {stationLabel}
          <input
            aria-label={stationLabel}
            value={value.station_callsign}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, station_callsign: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 BI1ABC" : "e.g. BI1ABC"}
          />
        </label>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label htmlFor="qso-date-input" style={{ margin: 0, fontWeight: 500 }}>
              {dateLabel}
            </label>
            {!isEditing && (
              <button
                type="button"
                onClick={() => {
                  const utc = getCurrentUtcDateTime();
                  setValue((v) => ({ ...v, qso_date: utc.qso_date, time_on: utc.time_on }));
                }}
                style={{
                  minHeight: "auto",
                  padding: "1px 6px",
                  fontSize: "0.75rem",
                  background: "transparent",
                  color: "var(--accent-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
                title={locale === "zh" ? "刷新为系统当前 UTC 日期与时间" : "Sync with system current UTC date & time"}
              >
                ⏱️ {locale === "zh" ? "当前 UTC" : "Now"}
              </button>
            )}
          </div>
          <input
            id="qso-date-input"
            type="text"
            value={value.qso_date}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, qso_date: event.target.value })}
            required
            placeholder="YYYYMMDD"
          />
        </div>
        <div>
          <label htmlFor="qso-time-input" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
            {timeLabel}
          </label>
          <input
            id="qso-time-input"
            type="text"
            value={value.time_on}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, time_on: event.target.value })}
            required
            placeholder="HHMMSS"
          />
        </div>
        <label>
          {bandLabel}
          <input
            aria-label={bandLabel}
            value={value.band}
            onChange={(event) => handleBandChange(event.target.value)}
            required
            placeholder={locale === "zh" ? "例如 20M, 40M, 70CM" : "e.g. 20M, 40M, 70CM"}
          />
        </label>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label htmlFor="qso-freq-input" style={{ margin: 0, fontWeight: 500 }}>
              {freqLabel}
            </label>
            {value.freq_mhz && (
              <span style={{ fontSize: "0.75rem", color: "var(--accent-primary)" }}>
                {getBandFromFreq(value.freq_mhz) ? `→ ${getBandFromFreq(value.freq_mhz)}` : ""}
              </span>
            )}
          </div>
          <input
            id="qso-freq-input"
            aria-label={freqLabel}
            list="frequency-presets-list"
            type="text"
            value={value.freq_mhz ?? ""}
            onChange={(event) => handleFreqChange(event.target.value)}
            placeholder={t("qsos.freqPlaceholder")}
          />
          <datalist id="frequency-presets-list">
            {TOP_10_DEFAULT_FREQS.map((p) => (
              <option key={p.freq} value={p.freq}>
                {p.label}
              </option>
            ))}
            {freqHistory.map((h) => (
              <option key={`hist-${h}`} value={h}>
                {h} MHz
              </option>
            ))}
          </datalist>
          <select
            aria-label={t("qsos.freqSelect")}
            value=""
            onChange={(event) => handleSelectFreq(event.target.value)}
            style={{
              marginTop: "0.35rem",
              fontSize: "0.8rem",
              padding: "0.3rem 0.5rem",
              minHeight: "34px",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-input)"
            }}
          >
            <option value="">{locale === "zh" ? "▼ 快捷选择常用/中继/历史频率" : "▼ Quick Select Common/Repeater/History"}</option>
            <optgroup label={locale === "zh" ? "常用中继与推荐频点" : "Common Repeaters & Frequencies"}>
              {TOP_10_DEFAULT_FREQS.map((p) => (
                <option key={`select-${p.freq}`} value={p.freq}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            {freqHistory.filter((h) => !TOP_10_DEFAULT_FREQS.some((p) => p.freq === h)).length > 0 && (
              <optgroup label={locale === "zh" ? "我的历史输入" : "My History"}>
                {freqHistory
                  .filter((h) => !TOP_10_DEFAULT_FREQS.some((p) => p.freq === h))
                  .map((h) => (
                    <option key={`select-hist-${h}`} value={h}>
                      {h} MHz
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>
        <label>
          {modeLabel}
          <input
            aria-label={modeLabel}
            value={value.mode}
            onChange={(event) => setValue({ ...value, mode: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 SSB, FT8, FM" : "e.g. SSB, FT8, FM"}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }}>
        <button type="submit" style={{ minWidth: "120px" }}>{saveLabel}</button>
        {message && (
          <output
            role="status"
            style={{
              color: message.includes("失败") || message.includes("Failed") || message.includes("changed") || message.includes("Stale")
                ? "var(--danger, #ef4444)"
                : "var(--success, #10b981)",
              fontWeight: 500
            }}
          >
            {message}
          </output>
        )}
      </div>
    </form>
  );
}
