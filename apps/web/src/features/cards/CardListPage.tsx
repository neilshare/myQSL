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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>已生成卡片</h2>
        <a href="/cards/create" style={{ textDecoration: "none", padding: "6px 12px", background: "#2563eb", color: "#fff", borderRadius: "4px" }}>
          生成新卡片
        </a>
      </header>
      <p>管理草稿、已就绪、已发布和已作废卡片。</p>
      {message && <output role="status">{message}</output>}

      {loading ? (
        <p>加载中...</p>
      ) : cards.length === 0 ? (
        <p>暂无卡片记录</p>
      ) : (
        <div className="card-list" style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
          {cards.map((c) => (
            <article key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>卡片 #{c.id.slice(0, 8)}</strong>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    background:
                      c.status === "published"
                        ? "#dcfce7"
                        : c.status === "void"
                        ? "#fee2e2"
                        : "#f3f4f6",
                    color:
                      c.status === "published"
                        ? "#166534"
                        : c.status === "void"
                        ? "#991b1b"
                        : "#374151"
                  }}
                >
                  {c.status}
                </span>
              </div>
              <p style={{ margin: "0.5rem 0" }}>
                关联 QSO: #{c.qso_id} | 模板: #{c.template_id}
              </p>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {c.status === "published" && (
                  <a href={`/c/${c.public_id}`} target="_blank" rel="noreferrer">
                    查看公开查验页
                  </a>
                )}
                {c.status === "published" && (
                  <button
                    type="button"
                    onClick={() => void handleVoid(c.id)}
                    style={{ background: "#ef4444", color: "#fff", border: "none", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}
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
