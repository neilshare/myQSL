import type { QsoRecord } from "../../../lib/api-types";

export const previewQsos: Array<{ id: string; label: string; qso: Record<string, unknown> }> = [
  { id: "cw", label: "CW · JA1ABC", qso: { call: "JA1ABC", station_callsign: "BI1ABC", qso_date: "20260914", time_on: "0830", band: "20M", mode: "CW", rst_sent: "599", rst_rcvd: "579", gridsquare: "PM95" } },
  { id: "ft8", label: "FT8 · DL7ABC", qso: { call: "DL7ABC", station_callsign: "BI1ABC", qso_date: "20260914", time_on: "0842", band: "20M", mode: "FT8", submode: "FT8", freq_hz: 14074000, rst_sent: "-05", rst_rcvd: "-12", gridsquare: "JO62" } },
  { id: "cn", label: "中文备注 · BD4XYZ", qso: { call: "BD4XYZ", station_callsign: "BI1ABC", qso_date: "20260914", time_on: "0901", band: "40M", mode: "SSB", name: "测试台站", qth: "上海", gridsquare: "OM81" } }
];

export function QsoPreviewPicker({ value, onChange }: { value: string; onChange: (qso: Record<string, unknown>) => void }) {
  return <label>预览示例 <select aria-label="预览示例" value={value} onChange={(event) => { const selected = previewQsos.find((item) => item.id === event.target.value); if (selected) onChange(selected.qso); }}>
    {previewQsos.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
  </select></label>;
}

export type PreviewQso = QsoRecord;
