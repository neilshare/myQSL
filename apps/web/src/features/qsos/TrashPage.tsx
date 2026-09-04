import { useEffect, useState, useCallback } from "react";
import { api, type QsoRecord } from "../../lib/api-client";

export function TrashPage() {
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
      setMessage(`QSO #${id} 已成功恢复`);
      void loadTrash();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "恢复失败");
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>🗑️ 回收站</h2>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>已软删除的 QSO 通联记录可在此随时恢复。</p>
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
            background: "rgba(59, 130, 246, 0.15)",
            color: "#93c5fd",
            border: "1px solid rgba(59, 130, 246, 0.3)"
          }}
        >
          {message}
        </output>
      )}

      <div className="qso-list">
        {rows.length === 0 ? (
          <div className="card-section" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
            回收站为空，暂无已删除通联记录
          </div>
        ) : (
          rows.map((row) => (
            <article key={String(row.id)}>
              <div className="qso-item-info">
                <strong style={{ fontSize: "1.15rem", letterSpacing: "0.02em" }}>{String(row.call)}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{String(row.qso_date)} {String(row.time_on)} UTC</span>
                <span style={{ background: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", padding: "2px 8px", borderRadius: "4px", fontSize: "0.85rem", fontWeight: 600 }}>
                  {String(row.band)} / {String(row.mode)}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  删除于: {row.deleted_at ? new Date(Number(row.deleted_at) * 1000).toLocaleString() : "-"}
                </span>
              </div>
              <div className="qso-actions">
                <button
                  type="button"
                  onClick={() => void handleRestore(Number(row.id))}
                  style={{ background: "#10b981", minWidth: "90px" }}
                >
                  恢复
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
