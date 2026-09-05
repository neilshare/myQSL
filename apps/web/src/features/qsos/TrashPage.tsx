import { useEffect, useState, useCallback } from "react";
import { api, type QsoRecord } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function TrashPage() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<QsoRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    try {
      const result = await api.qsos.list("?include_deleted=true");
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      const deleted = (list as QsoRecord[]).filter((r) => r.deleted_at != null);
      setRows(deleted);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  const handleRestore = async (id: number) => {
    try {
      await api.qsos.restore(id);
      setMessage(locale === "zh" ? `QSO #${id} 已成功恢复` : `QSO #${id} restored successfully`);
      void loadTrash();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : (locale === "zh" ? "恢复失败" : "Failed to restore"));
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>{t("trash.title")}</h2>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>{t("trash.subtitle")}</p>
        </div>
      </header>

      {message && (
        <output
          role="status"
          style={{
            display: "block",
            margin: "1rem 0",
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            background: "var(--badge-bg)",
            color: "var(--badge-text)",
            border: "1px solid var(--badge-border)"
          }}
        >
          {message}
        </output>
      )}

      <div className="qso-list">
        {rows.length === 0 ? (
          <div className="card-section" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
            {t("trash.empty")}
          </div>
        ) : (
          rows.map((row) => (
            <article key={String(row.id)}>
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
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  {locale === "zh" ? "删除于: " : "Deleted: "}{row.deleted_at ? new Date(Number(row.deleted_at) * 1000).toLocaleString() : "-"}
                </span>
              </div>
              <div className="qso-actions">
                <button
                  type="button"
                  onClick={() => void handleRestore(Number(row.id))}
                  style={{ background: "var(--success, #10b981)", minWidth: "90px" }}
                >
                  {locale === "zh" ? "恢复" : t("trash.restoreBtn")}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
