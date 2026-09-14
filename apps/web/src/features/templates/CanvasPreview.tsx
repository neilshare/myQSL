import React, { useEffect, useRef } from "react";
import { renderCard, renderSceneToCanvas, type RenderInput } from "@myqsl/card-renderer";
import { compileCardScene, type FontRegistry } from "@myqsl/card-scene";
import type { TemplateV2 } from "@myqsl/domain";

export function CanvasPreview({
  template,
  qso,
  backgroundUrl
}: {
  template: unknown;
  qso: Record<string, unknown>;
  backgroundUrl?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = React.useState<string | null>(null);

  const width = (template as any)?.base_width ?? 1264;
  const height = (template as any)?.base_height ?? 848;

  useEffect(() => {
    let active = true;
    setRenderError(null);

    async function draw() {
      if (!ref.current) return;
      if (typeof document !== "undefined" && "fonts" in document) {
        await document.fonts.ready;
      }
      if (!active || !ref.current) return;
      if ((template as { schema_version?: number })?.schema_version === 2) {
        const measureCanvas = document.createElement("canvas");
        const measure = measureCanvas.getContext("2d");
        if (!measure) throw new Error("Canvas 2D context is unavailable");
        const fonts = new Map<string, { width: (text: string, sizePt: number) => number; ascent: (sizePt: number) => number; hasGlyph: (codePoint: number) => boolean }>();
        for (const fontId of ["barlow-condensed-600", "ibm-plex-mono-400", "ibm-plex-mono-600", "noto-sans-sc-400"]) {
          fonts.set(fontId, {
            width: (text, sizePt) => {
              measure.font = `${sizePt}px ${fontId.includes("mono") ? "monospace" : "sans-serif"}`;
              return measure.measureText(text).width;
            },
            ascent: (sizePt) => sizePt * 0.8,
            hasGlyph: () => true
          });
        }
        const scene = compileCardScene(template as TemplateV2, { qso, publicUrl: "https://example.invalid/qsl-preview", proof: true }, fonts satisfies FontRegistry);
        await renderSceneToCanvas(ref.current, scene, { images: new Map(), fontFamilies: new Map([["barlow-condensed-600", "Arial"], ["ibm-plex-mono-400", "monospace"], ["ibm-plex-mono-600", "monospace"], ["noto-sans-sc-400", "sans-serif"]]) });
      } else {
        const input: RenderInput = backgroundUrl
          ? { layout: template as any, backgroundUrl }
          : (template as any);
        await renderCard(ref.current, input, qso);
      }
    }
    void draw().catch((err) => {
      if (active) {
        setRenderError(err instanceof Error ? err.message : "渲染失败");
      }
    });
    return () => {
      active = false;
    };
  }, [template, qso, backgroundUrl]);

  return (
    <div
      className="canvas-wrapper"
      style={{
        maxWidth: "100%",
        overflow: "hidden",
        borderRadius: "8px",
        border: "1px solid var(--border-subtle, #334155)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
      }}
    >
      {renderError && (
        <div role="alert" style={{ padding: "1rem", color: "#f87171", background: "rgba(239, 68, 68, 0.1)", textAlign: "center" }}>
          预览渲染异常: {renderError}
        </div>
      )}
      <canvas
        ref={ref}
        width={width}
        height={height}
        aria-label="QSL 预览"
        style={{ maxWidth: "100%", height: "auto", display: "block", aspectRatio: `${width} / ${height}` }}
      />
    </div>
  );
}
