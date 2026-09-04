import { useEffect, useState, useCallback } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";

export function TemplateListPage() {
  const [templates, setTemplates] = useState<CardTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.templates.list();
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setTemplates(list);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>QSL 模板</h2>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>选择模板并预览电子高清 PNG。</p>
        </div>
        <a
          href="/templates/edit"
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
          + 新建模板
        </a>
      </header>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>加载中...</p>
      ) : templates.length === 0 ? (
        <div className="card-section" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          暂无模板
        </div>
      ) : (
        <div className="template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {templates.map((t) => (
            <article key={t.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "1.25rem", background: "var(--bg-card)" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.15rem" }}>{t.name}</h3>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>尺寸: {t.base_width} × {t.base_height}</p>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>版本: v{t.version}</p>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>背景: {t.background_r2_key ? "已上传底图" : "无底图"}</p>
              <a
                href={`/templates/edit?id=${t.id}`}
                style={{
                  display: "inline-block",
                  marginTop: "0.75rem",
                  color: "#60a5fa",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                编辑排版与底图 &rarr;
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
