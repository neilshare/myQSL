import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { QsoForm } from "./QsoForm";

export function QsoListPage() {
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  useEffect(() => { void api.qsos.list().then((result) => setRows(result.data as unknown as Array<Record<string, string>>)).catch(() => setRows([])); }, []);
  return <section><h2>QSO 日志</h2><QsoForm initial={{ call: "", station_callsign: "", qso_date: "", time_on: "", band: "", mode: "" }} api={api.qsos} /><div className="qso-list">{rows.map((row, index) => <article key={row.id ?? index}><strong>{row.call}</strong><span>{row.qso_date} {row.time_on} UTC</span><span>{row.band} / {row.mode}</span></article>)}</div></section>;
}
