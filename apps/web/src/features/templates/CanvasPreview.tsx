import React, { useEffect, useRef } from "react";
import { renderCard, type RenderInput } from "@myqsl/card-renderer";

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
      const input: RenderInput = backgroundUrl
        ? { layout: template as any, backgroundUrl }
        : (template as any);
      await renderCard(ref.current, input, qso);
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

