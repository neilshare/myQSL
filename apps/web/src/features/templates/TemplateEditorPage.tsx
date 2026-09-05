import React, { useState, useEffect, useRef } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { CanvasPreview } from "./CanvasPreview";
import type { CardTemplate } from "@myqsl/domain";
import { useI18n } from "../../lib/i18n";

export function TemplateEditorPage() {
  const { t, locale } = useI18n();
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [name, setName] = useState(locale === "zh" ? "标准卡片模板" : "Standard Card Template");
  const [baseWidth, setBaseWidth] = useState(1264);
  const [baseHeight, setBaseHeight] = useState(848);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState<CardTemplate>({
    schema_version: 1,
    base_width: 1264,
    base_height: 848,
    elements: [
      {
        type: "text",
        x: 0.1,
        y: 0.2,
        field: "station_callsign",
        font: "Inter",
        font_size: 48,
        color: "#FFFFFF",
        align: "left",
      },
      {
        type: "text",
        x: 0.5,
        y: 0.5,
        field: "call",
        font: "Inter",
        font_size: 36,
        color: "#FFFFFF",
        align: "center",
      },
      {
        type: "text",
        x: 0.1,
        y: 0.8,
        field: "qso_date",
        font: "Inter",
        font_size: 24,
        color: "#FFFFFF",
        align: "left",
      },
    ],
  });

  const [message, setMessage] = useState<string | null>(null);
  const [_savedRow, setSavedRow] = useState<CardTemplateRow | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const idParam = urlParams.get("id");
    if (!idParam) return;
    const parsedId = parseInt(idParam, 10);
    if (Number.isNaN(parsedId)) return;

    setTemplateId(parsedId);
    setLoading(true);
    api.templates.get(parsedId)
      .then((res) => {
        const row = res.data;
        if (row) {
          setName(row.name);
          setBaseWidth(row.base_width);
          setBaseHeight(row.base_height);
          setVersion(row.version);
          if (row.layout_json) {
            try {
              const layout = JSON.parse(row.layout_json);
              setTemplate(layout);
            } catch {}
          }
          if (row.background_r2_key) {
            setBackgroundUrl(`/api/v1/card-templates/${row.id}/background`);
          }
        }
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : (locale === "zh" ? "加载模板失败" : "Failed to load template"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [locale]);

  const backgroundUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (backgroundUrlRef.current && backgroundUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(backgroundUrlRef.current);
      }
    };
  }, []);

  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (backgroundUrlRef.current && backgroundUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(backgroundUrlRef.current);
      }
      const newUrl = URL.createObjectURL(file);
      backgroundUrlRef.current = newUrl;
      setBackgroundFile(file);
      setBackgroundUrl(newUrl);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMessage(locale === "zh" ? "正在保存模板..." : "Saving template...");
      const updatedLayout: CardTemplate = {
        ...template,
        base_width: baseWidth,
        base_height: baseHeight,
      };

      if (templateId !== null) {
        const res = await api.templates.patch(templateId, {
          name,
          layout: updatedLayout,
          version
        });
        const updated = res.data;
        setSavedRow(updated);
        setVersion(updated.version);

        if (backgroundFile) {
          setMessage(locale === "zh" ? "正在上传模板底图..." : "Uploading background image...");
          await api.templates.uploadBackground(updated.id, backgroundFile, backgroundFile.type);
        }
        setMessage(locale === "zh" ? "模板已成功更新！" : "Template updated successfully!");
      } else {
        const res = await api.templates.create({
          name,
          layout: updatedLayout,
        });
        const created = res.data;
        setSavedRow(created);
        setTemplateId(created.id);
        setVersion(created.version);

        if (backgroundFile) {
          setMessage(locale === "zh" ? "正在上传模板底图..." : "Uploading background image...");
          await api.templates.uploadBackground(created.id, backgroundFile, backgroundFile.type);
        }
        setMessage(locale === "zh" ? "模板已成功保存！" : "Template saved successfully!");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (locale === "zh" ? "保存失败" : "Failed to save"));
    }
  };

  if (loading) {
    return <section><p style={{ color: "var(--text-muted)" }}>{locale === "zh" ? "正在加载模板数据..." : "Loading template data..."}</p></section>;
  }

  return (
    <section>
      <h2>{templateId ? (locale === "zh" ? `编辑模板 (v${version})` : `Edit Template (v${version})`) : (locale === "zh" ? "新建模板" : "New Template")}</h2>
      <p style={{ color: "var(--text-muted)" }}>{locale === "zh" ? "使用规范化坐标布置呼号、日期和二维码，并配置卡片底图。" : "Position callsign, date, and QR code using normalized coordinates, and configure background image."}</p>
      {message && <output role="status" style={{ color: "var(--accent-primary)" }}>{message}</output>}

      <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem", margin: "1rem 0" }}>
        <label>
          {t("templates.name")}:
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          <label>
            {locale === "zh" ? "宽度 (px):" : "Width (px):"}
            <input
              type="number"
              value={baseWidth}
              onChange={(e) => setBaseWidth(Number(e.target.value))}
              required
            />
          </label>
          <label>
            {locale === "zh" ? "高度 (px):" : "Height (px):"}
            <input
              type="number"
              value={baseHeight}
              onChange={(e) => setBaseHeight(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <label>
          {t("templates.bgImage")} (PNG/JPEG):
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleBackgroundChange}
          />
        </label>

        <button type="submit">{templateId ? (locale === "zh" ? "更新模板" : "Update Template") : t("templates.saveTemplate")}</button>
      </form>

      <div className="preview-container" style={{ marginTop: "1.5rem" }}>
        <h3>{locale === "zh" ? "实时排版预览" : "Live Layout Preview"}</h3>
        <CanvasPreview
          template={{ ...template, base_width: baseWidth, base_height: baseHeight }}
          backgroundUrl={backgroundUrl}
          qso={{
            call: "BH1AAA",
            station_callsign: "BI1ABC",
            qso_date: "20260904",
            time_on: "0830",
            band: "20M",
            mode: "CW",
          }}
        />
      </div>
    </section>
  );
}
