import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type QsoRecord } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";
import { ExportButton } from "../exports/ExportButton";
import { QsoFilters, type QsoFilterValues } from "./QsoFilters";
import { QsoForm } from "./QsoForm";

function formatClock(date: Date, utc: boolean): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: utc ? "UTC" : undefined }).format(date);
}

export function QsoListPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<QsoRecord[]>([]);
  const [filters, setFilters] = useState<QsoFilterValues>({});
  const [editingRow, setEditingRow] = useState<QsoRecord | null>(null);
  const [publishedCardCount, setPublishedCardCount] = useState(0);
  const [clock, setClock] = useState(() => new Date());

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

  const loadPublishedCards = useCallback(async () => {
    try {
      const result = await api.cards.list("?status=published");
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setPublishedCardCount(list.filter((card: { status?: string }) => card.status === "published").length);
    } catch {
      setPublishedCardCount(0);
    }
  }, []);

  useEffect(() => {
    void loadQsos(filters);
  }, [loadQsos, filters]);

  useEffect(() => {
    void loadPublishedCards();
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [loadPublishedCards]);

  const handleDelete = async (row: QsoRecord) => {
    if (!row.id) return;
    const etag = `W/"qso-${row.id}-${row.version ?? 1}"`;
    try {
      await api.qsos.delete(Number(row.id), etag);
      void loadQsos(filters);
    } catch (error) {
      console.error(error);
    }
  };

  const stats = useMemo(() => [
    { label: "本地时间", value: formatClock(clock, false), detail: "LOCAL" },
    { label: "UTC 时间", value: formatClock(clock, true), detail: "UTC" },
    { label: "我的通联", value: String(rows.length), detail: "当前列表" },
    { label: "我的 QSL", value: String(publishedCardCount), detail: "已发布" }
  ], [clock, rows.length, publishedCardCount]);

  return (
    <section className="qso-page">
      <header className="page-header qso-page-header">
        <div><p className="eyebrow">LOGBOOK</p><h2>{t("qsos.title")}</h2><p className="muted">记录频率、信号报告和设备细节，生成可追溯的 QSL 数据。</p></div>
        <div className="qso-page-actions"><a className="primary-button qso-create-action" href="#qso-create">＋ 新增通联</a><ExportButton /></div>
      </header>

      <div className="qso-summary-grid" aria-label="QSO 摘要">
        {stats.map((stat) => <article className="qso-summary-card" key={stat.label}><span className="qso-summary-label">{stat.label}</span><strong>{stat.value}</strong><span className="qso-summary-detail">{stat.detail}</span></article>)}
      </div>

      <div className="card-section qso-filter-section">
        <div className="section-heading-row"><div><p className="eyebrow">FILTER</p><h3>{t("qsos.filterTitle")}</h3></div><span className="muted">按呼号、波段、模式或 UTC 日期缩小范围</span></div>
        <QsoFilters onFilter={setFilters} />
      </div>

      <div className="card-section qso-create-section" id="qso-create">
        <div className="section-heading-row"><div><p className="eyebrow">NEW CONTACT</p><h3>{t("qsos.createTitle")}</h3></div><span className="qso-station-badge">默认：BI4BVN</span></div>
        <QsoForm initial={{ call: "", station_callsign: "", qso_date: "", time_on: "", band: "", freq_mhz: "", mode: "" }} api={api.qsos} onSaved={() => void loadQsos(filters)} />
      </div>

      {editingRow && <div className="edit-modal qso-edit-section" role="dialog" aria-label={t("qsos.editTitle")}>
        <div className="section-heading-row"><div><p className="eyebrow">EDIT CONTACT</p><h3>{t("qsos.editTitle")} #{editingRow.id}</h3></div></div>
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
            rst_sent: editingRow.rst_sent,
            rst_rcvd: editingRow.rst_rcvd,
            qth: editingRow.qth,
            my_rig: editingRow.my_rig,
            my_antenna: editingRow.my_antenna,
            my_power_w: editingRow.my_power_w,
            other_power_w: editingRow.other_power_w,
            comment: editingRow.comment
          }}
          etag={`W/"qso-${editingRow.id}-${editingRow.version ?? 1}"`}
          api={api.qsos}
          onSaved={() => { setEditingRow(null); void loadQsos(filters); }}
        />
        <button type="button" className="btn-secondary qso-cancel-edit" onClick={() => setEditingRow(null)}>{t("qsos.cancelEdit")}</button>
      </div>}

      <div className="qso-list" aria-label="QSO 记录列表">
        {rows.length === 0 ? <p className="qso-empty">{t("qsos.empty")}</p> : rows.map((row, index) => (
          <article key={String(row.id ?? index)}>
            <div className="qso-item-info">
              <div className="qso-row-primary"><strong>{String(row.call)}</strong><span className="qso-row-date">{String(row.qso_date)} {String(row.time_on).padEnd(6, "0")} UTC</span><span className="qso-row-badge">{String(row.band)} / {String(row.mode)}{row.freq_mhz ? ` · ${row.freq_mhz} MHz` : ""}</span></div>
              <div className="qso-row-details">
                <span>RST {row.rst_rcvd ?? "—"} / {row.rst_sent ?? "—"}</span>
                {row.qth && <span>QTH {row.qth}</span>}
                {row.my_rig && <span>{row.my_rig}</span>}
                {row.my_power_w != null && <span>{row.my_power_w} W</span>}
                {row.other_power_w != null && <span>对方 {row.other_power_w} W</span>}
              </div>
            </div>
            <div className="qso-actions"><a className="qso-external-row-link" href={`https://www.qrz.com/db/${encodeURIComponent(String(row.call))}`} target="_blank" rel="noopener noreferrer">QRZ ↗</a><a className="qso-external-row-link" href={`https://www.eqsl.cc/qslcard/MemberProfile.cfm?Callsign=${encodeURIComponent(String(row.call))}`} target="_blank" rel="noopener noreferrer">eQSL ↗</a><button type="button" className="btn-secondary" onClick={() => setEditingRow(row)}>{t("common.edit")}</button><button type="button" className="btn-danger" onClick={() => void handleDelete(row)}>{t("common.delete")}</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
