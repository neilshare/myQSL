import { useEffect, useState, useRef } from "react";
import { api, type QsoRecord, type CardTemplateRow, type CardRow } from "../../lib/api-client";
import { renderCard } from "@myqsl/card-renderer";
import type { CardTemplate } from "@myqsl/domain";

export function CardCreatePage() {
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
      setError("请选择 QSO 与模板");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus("正在创建草稿...");

    try {
      // 1. Create draft card
      const draftRes = await api.cards.create({
        qso_id: selectedQsoId,
        template_id: selectedTemplateId,
      });
      const card = (draftRes.data as any)?.data ?? draftRes.data;

      // 2. Render to canvas
      setStatus("正在渲染高清卡片...");
      const qso = qsos.find((q) => q.id === selectedQsoId);
      const templateRow = templates.find((t) => t.id === selectedTemplateId);
      if (!qso || !templateRow) throw new Error("QSO 或模板不存在");

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
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas 导出图片失败"))), "image/png");
      });

      // 4. Upload image to move to ready
      setStatus("正在上传卡片图片...");
      await api.cards.uploadImage(card.id, blob);

      // 5. Publish card
      setStatus("正在发布卡片...");
      const publishedRes = await api.cards.publish(card.id);
      const published = (publishedRes.data as any)?.data ?? publishedRes.data;
      setCreatedCard(published);
      setStatus("卡片已发布");
    } catch (err) {
      setError(err instanceof Error ? err.message : "制卡失败");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2>生成 QSL 卡片</h2>
      <p>从 QSO 快照生成电子高清 PNG。</p>
      {error && <output role="alert" style={{ color: "red" }}>{error}</output>}
      {status && <output role="status">{status}</output>}

      <div className="card-generator-controls">
        <label>
          选择 QSO:
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
          选择模板:
          <select
            aria-label="选择模板"
            value={selectedTemplateId ?? ""}
            onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={loading || qsos.length === 0 || templates.length === 0}
          onClick={() => void handleGenerateAndPublish()}
        >
          {loading ? "处理中..." : "生成并发布卡片"}
        </button>
      </div>

      <div
        className="canvas-container"
        style={{
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle, #334155)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ maxWidth: "100%", height: "auto", display: "block" }}
        />
      </div>

      {createdCard && (
        <div className="card-result" style={{ marginTop: "1rem" }}>
          <h3>卡片生成成功</h3>
          <p>
            公开查验链接:{" "}
            <a href={`/c/${createdCard.public_id}`} target="_blank" rel="noreferrer">
              /c/{createdCard.public_id}
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
