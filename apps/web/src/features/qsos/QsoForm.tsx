import { useState, type FormEvent } from "react";
import { api } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

type QsoFormValue = { id?: number; call: string; station_callsign: string; qso_date: string; time_on: string; band: string; mode: string; comment?: string };
type QsoFormApi = { patch: (id: number, patch: Record<string, unknown>, etag: string) => Promise<unknown>; create?: (input: Record<string, unknown>) => Promise<unknown> };

export function QsoForm({ initial, etag, api: formApi = api.qsos, onSaved }: { initial: QsoFormValue; etag?: string; api?: QsoFormApi; onSaved?: () => void }) {
  const { t, locale } = useI18n();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const isEditing = Boolean(value.id && etag);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (isEditing && value.id && etag) {
        const patchPayload: Record<string, unknown> = {
          band: value.band,
          mode: value.mode
        };
        if (value.comment !== undefined) patchPayload.comment = value.comment;
        await formApi.patch(value.id, patchPayload, etag);
      } else if (formApi.create) {
        const createPayload = {
          ...value,
          call: value.call.trim().toUpperCase(),
          time_on: value.time_on.length === 4 ? `${value.time_on}00` : value.time_on
        };
        await formApi.create(createPayload);
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
  const modeLabel = locale === "zh" ? "模式" : t("qsos.mode");
  const saveLabel = locale === "zh" ? "保存" : t("common.save");

  return (
    <form onSubmit={submit} aria-label={locale === "zh" ? "QSO 表单" : "QSO Form"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <label>
          {callLabel}
          <input
            aria-label={callLabel}
            value={value.call}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, call: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 BG4YYY" : "e.g. BG4YYY"}
          />
        </label>
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
        <label>
          {dateLabel}
          <input
            type="text"
            value={value.qso_date}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, qso_date: event.target.value })}
            required
            placeholder="YYYYMMDD"
          />
        </label>
        <label>
          {timeLabel}
          <input
            type="text"
            value={value.time_on}
            disabled={isEditing}
            onChange={(event) => setValue({ ...value, time_on: event.target.value })}
            required
            placeholder="HHMMSS"
          />
        </label>
        <label>
          {bandLabel}
          <input
            value={value.band}
            onChange={(event) => setValue({ ...value, band: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 20M" : "e.g. 20M"}
          />
        </label>
        <label>
          {modeLabel}
          <input
            value={value.mode}
            onChange={(event) => setValue({ ...value, mode: event.target.value })}
            required
            placeholder={locale === "zh" ? "例如 SSB, FT8" : "e.g. SSB, FT8"}
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
