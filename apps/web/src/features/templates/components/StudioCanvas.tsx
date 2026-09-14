import { useEffect, useRef, useState } from "react";
import { compileCardScene, type FontRegistry } from "@myqsl/card-scene";
import type { TemplateV2 } from "@myqsl/domain";
import type { StageEditorCommand } from "../editor/commands";
import { mountTemplateStage, type TemplateStage } from "../editor/konva-adapter";

export function StudioCanvas({ template, qso, onCommand }: { template: TemplateV2; qso: Record<string, unknown>; onCommand: (command: StageEditorCommand) => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const stage = useRef<TemplateStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!host.current) return;
    try {
      const fonts: FontRegistry = new Map(["barlow-condensed-600", "ibm-plex-mono-400", "ibm-plex-mono-600", "noto-sans-sc-400"].map((id) => [id, { width: (value, sizePt) => value.length * sizePt * 0.55, ascent: (sizePt) => sizePt * 0.8, hasGlyph: () => true }]));
      stage.current = mountTemplateStage(host.current, { onSelect: () => undefined, onCommand, onViewportChange: () => undefined });
      const scene = compileCardScene(template, { qso, publicUrl: "https://example.invalid/qsl-preview", proof: true }, fonts);
      stage.current.render({ scene, selectedIds: new Set(), viewport: { zoom: 0.85, panXCssPx: 0, panYCssPx: 0 }, guides: { trim: true, safe: true, center: true, objects: false } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "高级编辑器初始化失败");
    }
    return () => { stage.current?.destroy(); stage.current = null; };
  }, [onCommand, qso, template]);
  return <section aria-label="高级模板画布" style={{ display: "grid", gap: "0.5rem" }}><div ref={host} style={{ minHeight: 320, background: "#dbe4e8", borderRadius: 8, overflow: "hidden" }} />{error && <div role="alert" style={{ color: "#ef4444" }}>高级画布暂不可用：{error}。仍可使用快速设置和数值编辑。</div>}</section>;
}
