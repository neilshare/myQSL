export function StudioToolbar({ onFit }: { onFit: () => void }) {
  return <div role="toolbar" aria-label="画布工具栏"><button type="button" onClick={onFit}>适合窗口</button><span style={{ marginLeft: "0.5rem", color: "var(--text-muted)" }}>25%–400% · 禁止旋转与翻转</span></div>;
}
