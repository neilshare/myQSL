import { useEffect, useRef } from "react";
import { renderCard } from "@eqsr/card-renderer";

export function CanvasPreview({ template, qso }: { template: unknown; qso: Record<string, unknown> }) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { if (ref.current) void renderCard(ref.current, template, qso).catch(() => undefined); }, [template, qso]); return <canvas ref={ref} width={1264} height={848} aria-label="QSL 预览" />; }
