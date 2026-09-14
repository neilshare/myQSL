import type { Issue } from "@myqsl/card-scene";

export function PreflightPanel({ issues }: { issues: Issue[] }) {
  const blocking = issues.filter((issue) => issue.level === "error");
  return <section aria-labelledby="preflight-panel" style={{ padding: "1rem", border: `1px solid ${blocking.length ? "#ef4444" : "var(--border-subtle)"}`, borderRadius: "8px" }}>
    <h3 id="preflight-panel" style={{ margin: 0 }}>输出预检</h3>
    {issues.length === 0 ? <p role="status">场景通过当前预检，可以生成校样。</p> : <ul>{issues.map((issue, index) => <li key={`${issue.elementId}:${issue.code}:${index}`} style={{ color: issue.level === "error" ? "#ef4444" : "#b7791f" }}>{issue.message}</li>)}</ul>}
  </section>;
}
