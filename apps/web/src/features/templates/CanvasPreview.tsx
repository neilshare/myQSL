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

  useEffect(() => {
    let active = true;
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
    void draw().catch(() => undefined);
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
      <canvas
        ref={ref}
        width={1264}
        height={848}
        aria-label="QSL 预览"
        style={{ maxWidth: "100%", height: "auto", display: "block", aspectRatio: "1264 / 848" }}
      />
    </div>
  );
}

