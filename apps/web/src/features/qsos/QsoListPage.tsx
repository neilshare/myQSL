import { useEffect, useState, useCallback } from "react";
import { api, type QsoRecord } from "../../lib/api-client";
import { QsoForm } from "./QsoForm";
import { QsoFilters, type QsoFilterValues } from "./QsoFilters";
import { ExportButton } from "../exports/ExportButton";
import { useI18n } from "../../lib/i18n";

export function QsoListPage() {
  const { t } = useI18n();
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
      <header className="page-header">
        <h2>{t("qsos.title")}</h2>
        <ExportButton />
      </header>

      <div className="card-section" style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1.1rem" }}>{t("qsos.filterTitle")}</h3>
        <QsoFilters onFilter={handleFilter} />
      </div>

      <div className="card-section" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1.1rem" }}>{t("qsos.createTitle")}</h3>
        <QsoForm
          initial={{ call: "", station_callsign: "BI1ABC", qso_date: "", time_on: "", band: "", freq_mhz: "", mode: "" }}
          api={api.qsos}
          onSaved={() => void loadQsos(filters)}
        />
      </div>

      {editingRow && (
        <div
          className="edit-modal"
          role="dialog"
          aria-label={t("qsos.editTitle")}
          style={{
            margin: "1rem 0",
            padding: "1.25rem",
            border: "2px solid var(--accent-primary)",
            borderRadius: "10px",
            background: "var(--bg-card)"
          }}
        >
          <h3 style={{ marginTop: 0 }}>{t("qsos.editTitle")} #{editingRow.id}</h3>
          <QsoForm
            initial={{
              id: editingRow.id,
              call: editingRow.call,
              station_callsign: editingRow.station_callsign,
              qso_date: editingRow.qso_date,
              time_on: editingRow.time_on,
              band: editingRow.band,
              freq_mhz: editingRow.freq_mhz ?? undefined,
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditingRow(null)}
            style={{ marginTop: "1rem" }}
          >
            {t("qsos.cancelEdit")}
          </button>
        </div>
      )}

      <div className="qso-list">
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>{t("qsos.empty")}</p>
        ) : (
          rows.map((row, index) => (
            <article key={String(row.id ?? index)}>
              <div className="qso-item-info">
                <strong style={{ fontSize: "1.15rem", letterSpacing: "0.02em" }}>{String(row.call)}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{String(row.qso_date)} {String(row.time_on)} UTC</span>
                <span
                  style={{
                    background: "var(--badge-bg)",
                    color: "var(--badge-text)",
                    border: "1px solid var(--badge-border)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontWeight: 600
                  }}
                >
                  {String(row.band)} / {String(row.mode)}
                  {row.freq_mhz ? ` · ${row.freq_mhz} MHz` : ""}
                </span>
              </div>
              <div className="qso-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingRow(row)}>
                  {t("common.edit")}
                </button>
                <button type="button" className="btn-danger" onClick={() => void handleDelete(row)}>
                  {t("common.delete")}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
