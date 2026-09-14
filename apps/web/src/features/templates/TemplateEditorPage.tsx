import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from "react";
import { api, type CardTemplateRow } from "../../lib/api-client";
import { CanvasPreview } from "./CanvasPreview";
import { compileCardScene, preflightScene, type FontRegistry } from "@myqsl/card-scene";
import { CardTemplateV2Schema, type CardTemplate, type TemplateV2 } from "@myqsl/domain";
import { useI18n } from "../../lib/i18n";
import { QuickCustomizePanel } from "./components/QuickCustomizePanel";
import { QsoPreviewPicker, previewQsos } from "./components/QsoPreviewPicker";
import { PreflightPanel } from "./components/PreflightPanel";
import { applyEditorCommand, applyStageCommand, type EditorCommand, type StageEditorCommand } from "./editor/commands";
import { DraftStore } from "./editor/draft-store";
import { saveTemplate } from "./editor/save-controller";

const StudioCanvas = lazy(() => import("./components/StudioCanvas").then((module) => ({ default: module.StudioCanvas })));

export function TemplateEditorPage() {
  const { t, locale } = useI18n();
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [version, setVersion] = useState<number>(1);
  const [name, setName] = useState(locale === "zh" ? "标准卡片模板" : "Standard Card Template");
  const [baseWidth, setBaseWidth] = useState(1264);
  const [baseHeight, setBaseHeight] = useState(848);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState<CardTemplate | TemplateV2>({
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
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewQsoId, setPreviewQsoId] = useState("cw");
  const [previewQso, setPreviewQso] = useState<Record<string, unknown>>(previewQsos[0].qso);
  const [assetMetadata, setAssetMetadata] = useState(new Map<string, { id: string; widthPx: number; heightPx: number; sha256: string; expectedSha256: string }>());
  const draftStore = useRef(new DraftStore());
  const createKeyRef = useRef<string | null>(null);
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
              const parsedLayout = layout as CardTemplate | TemplateV2;
              setTemplate(parsedLayout);
              if (parsedLayout.schema_version === 2) {
                void draftStore.current.load(parsedId).then((draft) => {
                  if (!draft || draft.baseVersion !== row.version) return;
                  const restored = CardTemplateV2Schema.safeParse(draft.document);
                  if (restored.success && draft.savedAt > Date.now() - 7 * 24 * 60 * 60 * 1000) {
                    setTemplate(restored.data);
                    setDirty(true);
                    setMessage(locale === "zh" ? "已恢复本地草稿，请检查后保存。" : "Local draft restored; review and save it.");
                  }
                });
              }
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

  useEffect(() => {
    if (!dirty || template.schema_version !== 2) return;
    const timer = window.setTimeout(() => {
      void draftStore.current.save({ templateId, document: template, baseVersion: version, savedAt: Date.now(), formatVersion: 1 }).catch(() => {
        setMessage(locale === "zh" ? "本地草稿保存失败，请及时手动保存。" : "Local draft could not be saved; save manually soon.");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dirty, locale, template, templateId, version]);

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

  const previewIssues = useMemo(() => {
    if (template.schema_version !== 2) return [];
    const fontMetrics = new Map<string, { width: (value: string, sizePt: number) => number; ascent: (sizePt: number) => number; hasGlyph: (codePoint: number) => boolean }>();
    for (const id of ["barlow-condensed-600", "ibm-plex-mono-400", "ibm-plex-mono-600", "noto-sans-sc-400"]) fontMetrics.set(id, { width: (value, sizePt) => value.length * sizePt * 0.55, ascent: (sizePt) => sizePt * 0.8, hasGlyph: () => true });
    const scene = compileCardScene(template, { qso: previewQso, publicUrl: "https://example.invalid/qsl-preview", proof: true }, fontMetrics satisfies FontRegistry);
    return preflightScene(scene, assetMetadata, "single-bleed-v2");
  }, [assetMetadata, previewQso, template]);

  const handleCommand = (command: EditorCommand) => {
    if (template.schema_version === 2) {
      setTemplate(applyEditorCommand(template, command));
      setDirty(true);
    }
  };

  const handleStageCommand = (command: StageEditorCommand) => {
    if (template.schema_version === 2) {
      setTemplate(applyStageCommand(template, command));
      setDirty(true);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (templateId === null || template.schema_version !== 2) {
      setMessage(locale === "zh" ? "请先保存 V2 模板，再上传照片。" : "Save the V2 template before uploading a photo.");
      return;
    }
    try {
      const asset = await api.templates.uploadAsset(templateId, file, file.type);
      setAssetMetadata((current) => new Map(current).set(asset.asset_id, { id: asset.asset_id, widthPx: asset.width, heightPx: asset.height, sha256: asset.sha256, expectedSha256: asset.sha256 }));
      const imageNode = template.elements.find((element) => element.type === "image");
      handleCommand(imageNode ? { type: "replace-image", assetId: asset.asset_id, nodeId: imageNode.id } : { type: "add-image", assetId: asset.asset_id });
      setMessage(locale === "zh" ? "照片已上传，可在高级编辑器中裁切。" : "Photo uploaded; crop it in the advanced editor.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (locale === "zh" ? "照片上传失败" : "Photo upload failed"));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      setMessage(locale === "zh" ? "正在保存模板..." : "Saving template...");
      const updatedLayout: CardTemplate | TemplateV2 = template.schema_version === 2 ? template : { ...template, base_width: baseWidth, base_height: baseHeight };
      if (!createKeyRef.current) createKeyRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `template-${Date.now()}`;
      const result = await saveTemplate({ id: templateId, name, document: updatedLayout, baseVersion: version, idempotencyKey: createKeyRef.current }, api.templates);
      if (result.status === "conflict") {
        setMessage(locale === "zh" ? "远端版本已变化，本地修改仍保留；请另存副本或重新载入远端。" : "The remote version changed. Local edits are kept; save a copy or reload remote.");
        return;
      }
      if (result.status !== "saved") {
        setMessage(locale === "zh" ? "保存失败，请重新登录后重试。" : "Save failed; sign in again and retry.");
        return;
      }
      const updated = result.row as CardTemplateRow;
      setSavedRow(updated);
      setTemplateId(updated.id);
      setVersion(updated.version);
      if (backgroundFile) {
        setMessage(locale === "zh" ? "正在上传模板底图..." : "Uploading background image...");
        const uploaded = await api.templates.uploadBackground(updated.id, backgroundFile, backgroundFile.type);
        setVersion(uploaded.version);
      }
      await draftStore.current.clear(updated.id);
      setDirty(false);
      createKeyRef.current = null;
      setMessage(locale === "zh" ? "模板已成功保存！" : "Template saved successfully!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (locale === "zh" ? "保存失败" : "Failed to save"));
    } finally {
      setSaving(false);
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

      {template.schema_version === 2 && <div style={{ display: "grid", gap: "1rem", margin: "1rem 0" }}>
        <QuickCustomizePanel document={template} onCommand={handleCommand} onPhotoUpload={(file) => void handlePhotoUpload(file)} disabled={saving} />
        <QsoPreviewPicker value={previewQsoId} onChange={(qso) => { setPreviewQso(qso); const selected = previewQsos.find((item) => item.qso === qso); if (selected) setPreviewQsoId(selected.id); }} />
        <PreflightPanel issues={previewIssues} />
        <Suspense fallback={<p role="status">正在加载高级画布...</p>}><StudioCanvas template={template} qso={previewQso} onCommand={handleStageCommand} /></Suspense>
      </div>}

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

        <button type="submit" disabled={saving}>{saving ? (locale === "zh" ? "保存中..." : "Saving...") : templateId ? (locale === "zh" ? "更新模板" : "Update Template") : t("templates.saveTemplate")}</button>
      </form>

      <div className="preview-container" style={{ marginTop: "1.5rem" }}>
        <h3>{locale === "zh" ? "实时排版预览" : "Live Layout Preview"}</h3>
        <CanvasPreview
          template={template.schema_version === 2 ? template : { ...template, base_width: baseWidth, base_height: baseHeight }}
          backgroundUrl={backgroundUrl}
          qso={{
            call: "BH1AAA",
            station_callsign: "BI1ABC",
            ...previewQso,
          }}
        />
      </div>
    </section>
  );
}
