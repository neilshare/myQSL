import { useEffect, useState, useCallback } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";

export function TemplateListPage() {
  const [templates, setTemplates] = useState<CardTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.templates.list();
      setTemplates((res.data as unknown as CardTemplateRow[]) ?? []);
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>QSL 模板</h2>
        <a href="/templates/edit" style={{ textDecoration: "none", padding: "6px 12px", background: "#2563eb", color: "#fff", borderRadius: "4px" }}>
          新建模板
        </a>
      </header>
      <p>选择模板并预览电子高清 PNG。</p>

      {loading ? (
        <p>加载中...</p>
      ) : templates.length === 0 ? (
        <p>暂无模板</p>
      ) : (
        <div className="template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {templates.map((t) => (
            <article key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "1rem" }}>
              <h3>{t.name}</h3>
              <p>尺寸: {t.base_width} × {t.base_height}</p>
              <p>版本: v{t.version}</p>
              <p>背景: {t.background_r2_key ? "已上传底图" : "无底图"}</p>
              <a href={`/templates/edit?id=${t.id}`} style={{ display: "inline-block", marginTop: "0.5rem", color: "#2563eb" }}>
                编辑排版与底图
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
