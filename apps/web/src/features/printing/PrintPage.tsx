import { useState } from "react";
import { api } from "../../lib/api-client";

export function PrintPage() {
  const [qsoIds, setQsoIds] = useState(""); const [templateId, setTemplateId] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setMessage("");
    try {
      const result = await api.printing.create({ kind: "qso", qso_ids: qsoIds.split(",").map((value) => Number(value.trim())).filter(Boolean), template_id: Number(templateId), profile: "a4-four-up-v1", qr_policy: "omit_confirmed" }, crypto.randomUUID());
      const manifest = result.data as { batch_id: string; items: unknown[]; page_count?: number };
      setMessage(`批次 ${manifest.batch_id} 已冻结，共 ${manifest.items?.length ?? 0} 张。可重新打开批次生成 PDF。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建打印批次失败"); } finally { setBusy(false); }
  }
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">PRINT</p><h1>矢量 PDF 批量印刷</h1><p className="muted">输入有序 QSO ID，服务端先冻结快照，再生成 A4 四拼 PDF。</p></div></header><div className="form-card"><label>QSO ID（逗号分隔）<input value={qsoIds} onChange={(event) => setQsoIds(event.target.value)} placeholder="101,102,103,104" /></label><label>模板 ID<input value={templateId} onChange={(event) => setTemplateId(event.target.value)} inputMode="numeric" /></label><button type="button" className="primary-button" disabled={busy || !qsoIds || !templateId} onClick={() => void create()}>{busy ? "创建中…" : "冻结打印批次"}</button>{message && <p role="status" className="muted">{message}</p>}</div></section>;
}
