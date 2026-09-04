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
      <h2>回收站</h2>
      <p>已删除 QSO 可在此恢复。</p>
      {message && <output role="status">{message}</output>}
      <div className="trash-list">
        {rows.length === 0 ? (
          <p>回收站为空</p>
        ) : (
          rows.map((row) => (
            <article key={String(row.id)}>
              <strong>{String(row.call)}</strong>
              <span>{String(row.qso_date)} {String(row.time_on)} UTC</span>
              <span>{String(row.band)} / {String(row.mode)}</span>
              <span>删除于: {row.deleted_at ? new Date(Number(row.deleted_at) * 1000).toLocaleString() : "-"}</span>
              <button type="button" onClick={() => void handleRestore(Number(row.id))}>恢复</button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
