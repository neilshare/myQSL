import { useEffect, useState, useCallback } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";
import { useNavigate } from "react-router";
import { CanvasPreview } from "./CanvasPreview";
import type { TemplateV2 } from "@myqsl/domain";

type CardPreset = { id: string; version: number; name: string; tags: string[]; layout: TemplateV2 };

export function TemplateListPage() {
  const { t, locale } = useI18n();
  const [templates, setTemplates] = useState<CardTemplateRow[]>([]);
  const [presets, setPresets] = useState<CardPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const [templateRes, presetRes] = await Promise.all([api.templates.list(), api.templates.presets()]);
      const raw = templateRes.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setTemplates(list);
      const rawPresets = presetRes.data;
      setPresets(Array.isArray(rawPresets) ? rawPresets : []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const usePreset = async (preset: CardPreset) => {
    try {
      setPresetMessage(locale === "zh" ? `正在创建「${preset.name}」...` : `Creating ${preset.name}...`);
      const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${preset.id}-${Date.now()}`;
      const created = await api.templates.create({ name: preset.name, layout: preset.layout }, key);
      navigate(`/admin/templates/edit?id=${created.data.id}`);
    } catch (error) {
      setPresetMessage(error instanceof Error ? error.message : (locale === "zh" ? "预设创建失败" : "Failed to create preset"));
    }
  };

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

      {presetMessage && <output role="status" style={{ display: "block", marginTop: "1rem", color: "var(--accent-primary)" }}>{presetMessage}</output>}
      <section aria-labelledby="template-presets" style={{ marginTop: "2rem" }}>
        <h3 id="template-presets">{locale === "zh" ? "推荐预设" : "Recommended presets"}</h3>
        <p style={{ color: "var(--text-muted)" }}>{locale === "zh" ? "预设使用固定字体、印刷安全区和二维码白边，复制后可独立编辑。" : "Presets use controlled fonts, print-safe margins, and QR quiet zones. Copies are independent."}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {presets.map((preset) => (
            <article key={`${preset.id}:${preset.version}`} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "1rem", background: "var(--bg-card)" }}>
              <CanvasPreview template={preset.layout} qso={{ call: "JA1ABC", station_callsign: "BI1ABC", qso_date: "20260914", time_on: "0830", band: "20M", mode: "FT8", freq_hz: 14074000, gridsquare: "PM95" }} />
              <h4 style={{ margin: "0.75rem 0 0.25rem" }}>{preset.name}</h4>
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.9rem" }}>{preset.tags.join(" · ")}</p>
              <button type="button" onClick={() => void usePreset(preset)} style={{ marginTop: "0.75rem" }}>{locale === "zh" ? "使用此预设" : "Use this preset"}</button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
