import { useEffect, useState, useCallback } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function TemplateListPage() {
  const { t, locale } = useI18n();
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
          <h2>{t("templates.title")}</h2>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>{t("templates.subtitle")}</p>
        </div>
        <a
          href="/templates/edit"
          style={{
            textDecoration: "none",
            padding: "0.6rem 1.25rem",
            background: "var(--accent-primary)",
            color: "#fff",
            borderRadius: "6px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px"
          }}
        >
          {t("templates.create")}
        </a>
      </header>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <div className="card-section" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          {t("templates.empty")}
        </div>
      ) : (
        <div className="template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {templates.map((tRow) => (
            <article key={tRow.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "1.25rem", background: "var(--bg-card)" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.15rem" }}>{tRow.name}</h3>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>
                {t("templates.dimensions")}: {tRow.base_width} × {tRow.base_height}
              </p>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>
                {locale === "zh" ? "版本" : "Version"}: v{tRow.version}
              </p>
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0", fontSize: "0.9rem" }}>
                {t("templates.bgImage")}: {tRow.background_r2_key ? (locale === "zh" ? "已上传底图" : "Image Set") : (locale === "zh" ? "无底图" : "None")}
              </p>
              <a
                href={`/templates/edit?id=${tRow.id}`}
                style={{
                  display: "inline-block",
                  marginTop: "0.75rem",
                  color: "var(--accent-primary)",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                {locale === "zh" ? "编辑排版与底图 →" : "Edit Layout & Background →"}
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
