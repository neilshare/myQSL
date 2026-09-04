import { useEffect, useState, useCallback } from "react";
import { api, type QsoRecord } from "../../lib/api-client";
import { QsoForm } from "./QsoForm";
import { QsoFilters, type QsoFilterValues } from "./QsoFilters";
import { ExportButton } from "../exports/ExportButton";

export function QsoListPage() {
  const [rows, setRows] = useState<QsoRecord[]>([]);
  const [filters, setFilters] = useState<QsoFilterValues>({});

  const loadQsos = useCallback(async (currentFilters: QsoFilterValues) => {
    const params = new URLSearchParams();
    if (currentFilters.call) params.set("call", currentFilters.call);
    if (currentFilters.band) params.set("band", currentFilters.band);
    if (currentFilters.mode) params.set("mode", currentFilters.mode);
    if (currentFilters.date_from) params.set("date_from", currentFilters.date_from);
    if (currentFilters.date_to) params.set("date_to", currentFilters.date_to);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    try {
      const result = await api.qsos.list(queryString);
      setRows((result.data as unknown as QsoRecord[]) ?? []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void loadQsos(filters);
  }, [loadQsos, filters]);

  const handleFilter = (newFilters: QsoFilterValues) => {
    setFilters(newFilters);
  };

  const handleDelete = async (row: QsoRecord) => {
    if (!row.id) return;
    const etag = `"${row.version ?? 1}"`;
    try {
      await api.qsos.delete(Number(row.id), etag);
      void loadQsos(filters);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section>
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>QSO 日志</h2>
        <ExportButton />
      </header>
      <QsoFilters onFilter={handleFilter} />
      <QsoForm
        initial={{ call: "", station_callsign: "", qso_date: "", time_on: "", band: "", mode: "" }}
        api={api.qsos}
        onSaved={() => void loadQsos(filters)}
      />
      <div className="qso-list">
        {rows.map((row, index) => (
          <article key={String(row.id ?? index)}>
            <strong>{String(row.call)}</strong>
            <span>{String(row.qso_date)} {String(row.time_on)} UTC</span>
            <span>{String(row.band)} / {String(row.mode)}</span>
            <button type="button" onClick={() => void handleDelete(row)}>删除</button>
          </article>
        ))}
      </div>
    </section>
  );
}
