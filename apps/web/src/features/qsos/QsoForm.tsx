import { useState, type FormEvent } from "react";
import { api } from "../../lib/api-client";

type QsoFormValue = { id?: number; call: string; station_callsign: string; qso_date: string; time_on: string; band: string; mode: string; comment?: string };
type QsoFormApi = { patch: (id: number, patch: Record<string, unknown>, etag: string) => Promise<unknown>; create?: (input: Record<string, unknown>) => Promise<unknown> };

export function QsoForm({ initial, etag, api: formApi = api.qsos, onSaved }: { initial: QsoFormValue; etag?: string; api?: QsoFormApi; onSaved?: () => void }) {
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const patch = { ...value, call: value.call.trim().toUpperCase(), time_on: value.time_on.length === 4 ? `${value.time_on}00` : value.time_on };
      if (value.id && etag) await formApi.patch(value.id, patch, etag);
      else if (formApi.create) await formApi.create(patch);
      setMessage("已保存");
      onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  };
  return (
    <form onSubmit={submit} aria-label="QSO 表单">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <label>对方呼号<input aria-label="对方呼号" value={value.call} onChange={(event) => setValue({ ...value, call: event.target.value })} required placeholder="例如 BG4YYY" /></label>
        <label>本台呼号<input aria-label="本台呼号" value={value.station_callsign} onChange={(event) => setValue({ ...value, station_callsign: event.target.value })} required placeholder="例如 BI1ABC" /></label>
        <label>UTC 日期<input type="text" value={value.qso_date} onChange={(event) => setValue({ ...value, qso_date: event.target.value })} required placeholder="YYYYMMDD" /></label>
        <label>UTC 时间<input type="text" value={value.time_on} onChange={(event) => setValue({ ...value, time_on: event.target.value })} required placeholder="HHMMSS" /></label>
        <label>波段<input value={value.band} onChange={(event) => setValue({ ...value, band: event.target.value })} required placeholder="例如 20M" /></label>
        <label>模式<input value={value.mode} onChange={(event) => setValue({ ...value, mode: event.target.value })} required placeholder="例如 SSB, FT8" /></label>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }}>
        <button type="submit" style={{ minWidth: "120px" }}>保存</button>
        {message && <output role="status" style={{ color: message.includes("失败") ? "var(--danger, #ef4444)" : "var(--success, #10b981)", fontWeight: 500 }}>{message}</output>}
      </div>
    </form>
  );
}
