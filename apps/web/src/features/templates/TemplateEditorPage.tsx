import React, { useState, useEffect, useRef } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { CanvasPreview } from "./CanvasPreview";
import type { CardTemplate } from "@myqsl/domain";

export function TemplateEditorPage() {
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [name, setName] = useState("标准卡片模板");
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
        setMessage(err instanceof Error ? err.message : "加载模板失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBackgroundFile(file);
      setBackgroundUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMessage("正在保存模板...");
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
          setMessage("正在上传模板底图...");
          await api.templates.uploadBackground(updated.id, backgroundFile, backgroundFile.type);
        }
        setMessage("模板已成功更新！");
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
          setMessage("正在上传模板底图...");
          await api.templates.uploadBackground(created.id, backgroundFile, backgroundFile.type);
        }
        setMessage("模板已成功保存！");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  };

  if (loading) {
    return <section><p style={{ color: "var(--text-muted)" }}>正在加载模板数据...</p></section>;
  }

  return (
    <section>
      <h2>{templateId ? `编辑模板 (v${version})` : "新建模板"}</h2>
      <p>使用规范化坐标布置呼号、日期和二维码，并配置卡片底图。</p>
      {message && <output role="status">{message}</output>}

      <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem", margin: "1rem 0" }}>
        <label>
          模板名称:
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          <label>
            宽度 (px):
            <input
              type="number"
              value={baseWidth}
              onChange={(e) => setBaseWidth(Number(e.target.value))}
              required
            />
          </label>
          <label>
            高度 (px):
            <input
              type="number"
              value={baseHeight}
              onChange={(e) => setBaseHeight(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <label>
          模板底图 (PNG/JPEG):
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleBackgroundChange}
          />
        </label>

        <button type="submit">{templateId ? "更新模板" : "保存模板"}</button>
      </form>

      <div className="preview-container" style={{ marginTop: "1.5rem" }}>
        <h3>实时排版预览</h3>
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

