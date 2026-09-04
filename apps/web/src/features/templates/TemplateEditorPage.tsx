import { useState, useRef } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { CanvasPreview } from "./CanvasPreview";
import type { CardTemplate } from "@eqsr/domain";

export function TemplateEditorPage() {
  const [name, setName] = useState("标准卡片模板");
  const [baseWidth, setBaseWidth] = useState(1264);
  const [baseHeight, setBaseHeight] = useState(848);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [template] = useState<CardTemplate>({
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      const res = await api.templates.create({
        name,
        layout: updatedLayout,
      });
      const created = res.data;
      setSavedRow(created);

      if (backgroundFile) {
        setMessage("正在上传模板底图...");
        await api.templates.uploadBackground(created.id, backgroundFile, backgroundFile.type);
      }

      setMessage("模板已成功保存！");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  };

  return (
    <section>
      <h2>模板编辑器</h2>
      <p>使用规范化坐标布置呼号、日期和二维码，并配置卡片底图。</p>
      {message && <output role="status">{message}</output>}

      <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem", margin: "1rem 0" }}>
        <label>
          模板名称:
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div style={{ display: "flex", gap: "1rem" }}>
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

        <button type="submit">保存模板</button>
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
