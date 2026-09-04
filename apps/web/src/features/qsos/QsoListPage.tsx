import { useEffect, useState, useCallback } from "react";
import { api, type QsoRecord } from "../../lib/api-client";
import { QsoForm } from "./QsoForm";
import { QsoFilters, type QsoFilterValues } from "./QsoFilters";
import { ExportButton } from "../exports/ExportButton";

export function QsoListPage() {
  const [rows, setRows] = useState<QsoRecord[]>([]);
  const [filters, setFilters] = useState<QsoFilterValues>({});
  const [editingRow, setEditingRow] = useState<QsoRecord | null>(null);

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
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setRows(list);
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
    const etag = `W/"qso-${row.id}-${row.version ?? 1}"`;
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
        initial={{ call: "", station_callsign: "BI1ABC", qso_date: "", time_on: "", band: "", mode: "" }}
        api={api.qsos}
        onSaved={() => void loadQsos(filters)}
      />
      {editingRow && (
        <div className="edit-modal" role="dialog" aria-label="编辑 QSO" style={{ margin: "16px 0", padding: "16px", border: "2px solid #2563eb", borderRadius: "8px" }}>
          <h3>编辑 QSO #{editingRow.id}</h3>
          <QsoForm
            initial={{
              id: editingRow.id,
              call: editingRow.call,
              station_callsign: editingRow.station_callsign,
              qso_date: editingRow.qso_date,
              time_on: editingRow.time_on,
              band: editingRow.band,
              mode: editingRow.mode,
              comment: editingRow.comment ?? undefined
            }}
            etag={`W/"qso-${editingRow.id}-${editingRow.version ?? 1}"`}
            api={api.qsos}
            onSaved={() => {
              setEditingRow(null);
              void loadQsos(filters);
            }}
          />
          <button type="button" onClick={() => setEditingRow(null)} style={{ marginTop: "8px" }}>取消编辑</button>
        </div>
      )}
      <div className="qso-list">
        {rows.map((row, index) => (
          <article key={String(row.id ?? index)}>
            <strong>{String(row.call)}</strong>
            <span>{String(row.qso_date)} {String(row.time_on)} UTC</span>
            <span>{String(row.band)} / {String(row.mode)}</span>
            <button type="button" onClick={() => setEditingRow(row)}>编辑</button>
            <button type="button" onClick={() => void handleDelete(row)}>删除</button>
          </article>
        ))}
      </div>
    </section>
  );
}
