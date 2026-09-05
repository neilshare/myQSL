import { useEffect, useState, useRef } from "react";
import { api, type QsoRecord, type CardTemplateRow, type CardRow } from "../../lib/api-client";
import { renderCard } from "@myqsl/card-renderer";
import type { CardTemplate } from "@myqsl/domain";
import { useI18n } from "../../lib/i18n";

export function CardCreatePage() {
  const { t, locale } = useI18n();
  const [qsos, setQsos] = useState<QsoRecord[]>([]);
  const [templates, setTemplates] = useState<CardTemplateRow[]>([]);
  const [selectedQsoId, setSelectedQsoId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [createdCard, setCreatedCard] = useState<CardRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void api.qsos.list("?limit=100").then((res) => {
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setQsos(data);
      if (data.length > 0) setSelectedQsoId(data[0].id);
    }).catch(() => setQsos([]));

    void api.templates.list().then((res) => {
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setTemplates(data);
      if (data.length > 0) setSelectedTemplateId(data[0].id);
    }).catch(() => setTemplates([]));
  }, []);

  const handleGenerateAndPublish = async () => {
    if (!selectedQsoId || !selectedTemplateId) {
      setError(locale === "zh" ? "请选择 QSO 与模板" : "Please select QSO and template");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(locale === "zh" ? "正在创建草稿..." : "Creating draft...");

    try {
      // 1. Create draft card
      const draftRes = await api.cards.create({
        qso_id: selectedQsoId,
        template_id: selectedTemplateId,
      });
      const card = (draftRes.data as any)?.data ?? draftRes.data;

      // 2. Render to canvas
      setStatus(locale === "zh" ? "正在渲染高清卡片..." : "Rendering card...");
      const qso = qsos.find((q) => q.id === selectedQsoId);
      const templateRow = templates.find((t) => t.id === selectedTemplateId);
      if (!qso || !templateRow) throw new Error(locale === "zh" ? "QSO 或模板不存在" : "QSO or template not found");

      const layout = JSON.parse(templateRow.layout_json) as CardTemplate;
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvas.width = layout.base_width || 1264;
      canvas.height = layout.base_height || 848;

      await renderCard(
        canvas,
        {
          layout,
          backgroundUrl: templateRow.background_r2_key ? `/api/v1/card-templates/${templateRow.id}/background` : undefined,
        },
        {
          call: qso.call,
          station_callsign: qso.station_callsign,
          qso_date: qso.qso_date,
          time_on: qso.time_on,
          band: qso.band,
          mode: qso.mode,
          rst_sent: qso.rst_sent ?? undefined,
          rst_rcvd: qso.rst_rcvd ?? undefined,
        },
        `${window.location.origin}/c/${card.public_id}`
      );

      // 3. Export canvas blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas blob export failed"))), "image/png");
      });

      // 4. Upload image to move to ready
      setStatus(locale === "zh" ? "正在上传卡片图片..." : "Uploading card image...");
      await api.cards.uploadImage(card.id, blob);

      // 5. Publish card
      setStatus(locale === "zh" ? "正在发布卡片..." : "Publishing card...");
      const publishedRes = await api.cards.publish(card.id);
      const published = (publishedRes.data as any)?.data ?? publishedRes.data;
      setCreatedCard(published);
      setStatus(locale === "zh" ? "卡片已发布" : "Card published");
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === "zh" ? "制卡失败" : "Failed to create card"));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2>{t("cards.createNew")}</h2>
      <p style={{ color: "var(--text-muted)" }}>{locale === "zh" ? "从 QSO 快照生成电子高清 PNG。" : "Generate HD PNG from QSO snapshot."}</p>
      {error && <output role="alert" style={{ color: "var(--danger)" }}>{error}</output>}
      {status && <output role="status" style={{ color: "var(--accent-primary)" }}>{status}</output>}

      <div className="card-generator-controls">
        <label>
          {t("cards.selectQso")}:
          <select
            aria-label="选择 QSO"
            value={selectedQsoId ?? ""}
            onChange={(e) => setSelectedQsoId(Number(e.target.value))}
          >
            {qsos.map((q) => (
              <option key={q.id} value={q.id}>
                {q.call} - {q.qso_date} {q.time_on} ({q.band}/{q.mode})
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("cards.selectTemplate")}:
          <select
            aria-label="选择模板"
            value={selectedTemplateId ?? ""}
            onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
          >
            {templates.map((tRow) => (
              <option key={tRow.id} value={tRow.id}>
                {tRow.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={loading || qsos.length === 0 || templates.length === 0}
          onClick={() => void handleGenerateAndPublish()}
        >
          {loading ? t("common.loading") : (locale === "zh" ? "生成并发布卡片" : "Generate & Publish")}
        </button>
      </div>

      <div
        className="canvas-container"
        style={{
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--card-shadow)"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ maxWidth: "100%", height: "auto", display: "block" }}
        />
      </div>

      {createdCard && (
        <div className="card-result" style={{ marginTop: "1rem" }}>
          <h3 style={{ color: "var(--success)" }}>{locale === "zh" ? "卡片生成成功" : "Card Created Successfully"}</h3>
          <p>
            {t("cards.publicView")}:{" "}
            <a href={`/c/${createdCard.public_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>
              /c/{createdCard.public_id}
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
