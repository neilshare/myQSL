import { CardTemplateV2Schema, type TemplateV2 } from "@myqsl/domain";

export type CardPreset = { id: string; version: number; name: string; tags: string[]; layout: TemplateV2 };

const text = (id: string, name: string, x: number, y: number, width: number, height: number, source: { kind: "literal"; text: string } | { kind: "qso"; field: "station_callsign" | "call" | "qso_date" | "time_on" | "band" | "mode" | "submode" | "freq_mhz" | "rst_sent" | "rst_rcvd" | "gridsquare" | "name" | "qth" | "comment" | "my_grid" }, font_id: string, size_pt: number, color: string, align: "left" | "center" | "right" = "left", fit: "shrink" | "wrap" = "shrink", required = false) => ({ type: "text" as const, id, name, x_mm: x, y_mm: y, width_mm: width, height_mm: height, locked: false, visible: true, source, font_id, size_pt, min_size_pt: Math.max(8, size_pt - 4), color, align, fit, required });
const rect = (id: string, name: string, x: number, y: number, width: number, height: number, fill: string) => ({ type: "rect" as const, id, name, x_mm: x, y_mm: y, width_mm: width, height_mm: height, locked: true, visible: true, fill });
const qr = (id: string, x: number, y: number, size: number) => ({ type: "qr" as const, id, name: "Published card QR", x_mm: x, y_mm: y, width_mm: size, height_mm: size, locked: true, visible: true, source: "public_url" as const, quiet_modules: 4 as const });

const base = (background: string, preset: { id: string; version: number }, elements: TemplateV2["elements"]): TemplateV2 => CardTemplateV2Schema.parse({ schema_version: 2, base_width: 1400, base_height: 900, trim: { width_mm: 140, height_mm: 90 }, bleed_mm: 3, safe_mm: 5, background, font_manifest_version: "fonts-2026-09-14", preset, elements });

const classicDx = base("#F4EBDD", { id: "classic-dx", version: 1 }, [
  rect("paper", "Paper background", 0, 0, 140, 90, "#F4EBDD"),
  rect("accent", "Warm accent panel", 0, 0, 8, 90, "#C96B3B"),
  text("eyebrow", "QSL title", 15, 8, 70, 8, { kind: "literal", text: "QSL CARD · DX CONTACT" }, "barlow-condensed-600", 14, "#7B3F2B"),
  text("station", "Station callsign", 15, 20, 55, 11, { kind: "qso", field: "station_callsign" }, "ibm-plex-mono-600", 20, "#15344B"),
  text("call", "Contact callsign", 15, 33, 75, 18, { kind: "qso", field: "call" }, "ibm-plex-mono-600", 32, "#15344B"),
  text("date", "QSO date", 15, 61, 32, 8, { kind: "qso", field: "qso_date" }, "ibm-plex-mono-400", 13, "#15344B"),
  text("time", "QSO time", 50, 61, 25, 8, { kind: "qso", field: "time_on" }, "ibm-plex-mono-400", 13, "#15344B"),
  text("band", "Band", 15, 73, 25, 8, { kind: "qso", field: "band" }, "ibm-plex-mono-400", 13, "#15344B"),
  text("mode", "Mode", 43, 73, 35, 8, { kind: "qso", field: "mode" }, "ibm-plex-mono-400", 13, "#15344B"),
  text("freq", "Frequency", 15, 82, 45, 6, { kind: "qso", field: "freq_mhz" }, "ibm-plex-mono-400", 10, "#7B3F2B"),
  text("grid", "Grid", 65, 82, 35, 6, { kind: "qso", field: "gridsquare" }, "ibm-plex-mono-400", 10, "#7B3F2B"),
  qr("qr", 111, 61, 24)
]);

const photoJournal = base("#EAF2F2", { id: "photo-journal", version: 1 }, [
  rect("paper", "Blue paper background", 0, 0, 140, 90, "#EAF2F2"),
  rect("photo-frame", "Photo frame", 7, 8, 64, 55, "#C9DADA"),
  text("photo-placeholder", "Photo placeholder", 13, 31, 52, 8, { kind: "literal", text: "ADD YOUR PHOTO" }, "barlow-condensed-600", 14, "#48646A", "center", "shrink", true),
  text("journal", "Journal heading", 79, 10, 53, 8, { kind: "literal", text: "FIELD NOTES" }, "barlow-condensed-600", 14, "#2E5961"),
  text("call", "Contact callsign", 79, 23, 53, 15, { kind: "qso", field: "call" }, "ibm-plex-mono-600", 28, "#15344B"),
  text("station", "Station callsign", 79, 42, 53, 8, { kind: "qso", field: "station_callsign" }, "ibm-plex-mono-400", 13, "#48646A"),
  text("date", "Date", 79, 55, 25, 8, { kind: "qso", field: "qso_date" }, "ibm-plex-mono-400", 12, "#48646A"),
  text("mode", "Mode", 108, 55, 24, 8, { kind: "qso", field: "mode" }, "ibm-plex-mono-400", 12, "#48646A"),
  text("grid", "Grid square", 79, 68, 38, 8, { kind: "qso", field: "gridsquare" }, "ibm-plex-mono-400", 12, "#48646A"),
  qr("qr", 108, 63, 25)
]);

const minimalGrid = base("#102A43", { id: "minimal-grid", version: 1 }, [
  rect("paper", "Navy background", 0, 0, 140, 90, "#102A43"),
  rect("rule-top", "Top rule", 8, 9, 124, 0.5, "#8CC5D5"),
  rect("rule-bottom", "Bottom rule", 8, 81, 124, 0.5, "#8CC5D5"),
  text("label", "Contact label", 9, 14, 50, 7, { kind: "literal", text: "CONFIRMED CONTACT" }, "barlow-condensed-600", 12, "#8CC5D5"),
  text("call", "Contact callsign", 9, 26, 77, 18, { kind: "qso", field: "call" }, "ibm-plex-mono-600", 32, "#FFFFFF"),
  text("station", "Station", 9, 50, 45, 7, { kind: "qso", field: "station_callsign" }, "ibm-plex-mono-400", 12, "#D7EEF2"),
  text("band", "Band", 9, 62, 23, 7, { kind: "qso", field: "band" }, "ibm-plex-mono-400", 12, "#D7EEF2"),
  text("mode", "Mode", 36, 62, 30, 7, { kind: "qso", field: "mode" }, "ibm-plex-mono-400", 12, "#D7EEF2"),
  text("date", "Date", 70, 62, 30, 7, { kind: "qso", field: "qso_date" }, "ibm-plex-mono-400", 12, "#D7EEF2"),
  text("grid", "Grid", 9, 72, 40, 7, { kind: "qso", field: "gridsquare" }, "ibm-plex-mono-400", 12, "#8CC5D5"),
  qr("qr", 108, 52, 25)
]);

const definitions: CardPreset[] = [
  { id: "classic-dx", version: 1, name: "Classic DX", tags: ["warm", "dx", "voice"], layout: classicDx },
  { id: "photo-journal", version: 1, name: "Photo Journal", tags: ["photo", "journal", "field"], layout: photoJournal },
  { id: "minimal-grid", version: 1, name: "Minimal Grid", tags: ["minimal", "digital", "ft8"], layout: minimalGrid }
];

export function getPresets(): CardPreset[] {
  return definitions.map((preset) => ({ ...preset, tags: [...preset.tags], layout: JSON.parse(JSON.stringify(preset.layout)) as TemplateV2 }));
}
