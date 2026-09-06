import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";

type AgentEvent = Record<string, unknown>;

export function AgentReviewInbox() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [message, setMessage] = useState("");
  async function load() {
    try { setEvents((await api.integrations.listAgentEvents()).data); } catch (error) { setMessage(error instanceof Error ? error.message : "读取异常收件箱失败"); }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000); return () => window.clearInterval(timer); }, []);
  async function dismiss(id: string) {
    const reason = window.prompt("请输入忽略原因（至少 3 个字符）", "已由台主核对，无需更新")?.trim();
    if (!reason) return;
    try { await api.integrations.dismissAgentEvent(id, reason); setMessage("已记录处理原因"); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "处理失败"); }
  }
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">REVIEW INBOX</p><h1>代理异常收件箱</h1><p className="muted">外部替换/删除只进入审核，不会自动改写 QSO。页面每 5 秒刷新，切到后台会暂停。</p></div></header><div className="table-card">{events.length === 0 && <p className="muted">当前没有待处理事件。</p>}{events.map((event) => <article className="list-row" key={String(event.id)}><div><strong>{String(event.event_kind)} · {String(event.source_record_id)}</strong><p className="muted">{String(event.device_name)} / {String(event.expected_station_callsign)} · {new Date(Number(event.created_at)).toLocaleString()}</p><pre className="code-block">{JSON.stringify(event.issues, null, 2)}</pre></div><button type="button" onClick={() => void dismiss(String(event.id))}>忽略并记录原因</button></article>)}{message && <p role="status" className="muted">{message}</p>}</div></section>;
}
