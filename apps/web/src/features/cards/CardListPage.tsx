import { useEffect, useState, useCallback } from "react";
import { api, type CardRow } from "../../lib/api-client";

export function CardListPage() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.cards.list();
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setCards(list);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const handleVoid = async (id: string) => {
    if (!confirm("确定要作废此卡片吗？作废后不可恢复。")) return;
    try {
      await api.cards.void(id);
      setMessage(`卡片已成功作废`);
      void loadCards();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "作废失败");
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>已生成卡片</h2>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>管理草稿、已就绪、已发布和已作废卡片。</p>
        </div>
        <a
          href="/cards/create"
          style={{
            textDecoration: "none",
            padding: "0.6rem 1.25rem",
            background: "var(--accent-primary, #2563eb)",
            color: "#fff",
            borderRadius: "6px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px"
          }}
        >
          + 生成新卡片
        </a>
      </header>

      {message && <output role="status" style={{ display: "block", margin: "1rem 0" }}>{message}</output>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>加载中...</p>
      ) : cards.length === 0 ? (
        <div className="card-section" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          暂无卡片记录
        </div>
      ) : (
        <div className="card-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {cards.map((c) => (
            <article key={c.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "1.25rem", background: "var(--bg-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "1.1rem" }}>卡片 #{c.id.slice(0, 8)}</strong>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background:
                      c.status === "published"
                        ? "rgba(16, 185, 129, 0.15)"
                        : c.status === "void"
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(148, 163, 184, 0.15)",
                    color:
                      c.status === "published"
                        ? "#34d399"
                        : c.status === "void"
                        ? "#f87171"
                        : "#94a3b8",
                    border:
                      c.status === "published"
                        ? "1px solid rgba(16, 185, 129, 0.3)"
                        : c.status === "void"
                        ? "1px solid rgba(239, 68, 68, 0.3)"
                        : "1px solid rgba(148, 163, 184, 0.3)"
                  }}
                >
                  {c.status}
                </span>
              </div>
              <p style={{ margin: "0.75rem 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                关联 QSO: #{c.qso_id} | 模板: #{c.template_id}
              </p>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem", flexWrap: "wrap" }}>
                {c.status === "published" && (
                  <a href={`/c/${c.public_id}`} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 500, fontSize: "0.9rem" }}>
                    查看公开查验页 &rarr;
                  </a>
                )}
                {c.status === "published" && (
                  <button
                    type="button"
                    onClick={() => void handleVoid(c.id)}
                    className="btn-danger"
                    style={{ padding: "0.4rem 0.85rem", minHeight: "38px", fontSize: "0.85rem" }}
                  >
                    作废卡片
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
