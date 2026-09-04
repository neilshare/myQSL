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

  return <canvas ref={ref} width={1264} height={848} aria-label="QSL 预览" />;
}
