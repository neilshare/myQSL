import { CardTemplateSchema, type CardTemplate } from "@eqsr/domain";
import QRCode from "qrcode";
import { formatQsoField } from "./format";

export function assertRenderableTemplate(input: unknown): CardTemplate { return CardTemplateSchema.parse(input); }

export async function renderCard(canvas: HTMLCanvasElement, input: unknown, qso: Record<string, unknown>, publicUrl = ""): Promise<void> {
  const template = assertRenderableTemplate(input);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  const width = canvas.width || template.base_width;
  const height = canvas.height || template.base_height;
  for (const element of template.elements) {
    const x = element.x * width;
    const y = element.y * height;
    if (element.type === "text") {
      context.font = `${element.font_size * (width / template.base_width)}px ${element.font}`;
      context.fillStyle = element.color;
      context.textAlign = element.align;
      context.fillText(formatQsoField(qso, element.field), x, y);
      continue;
    }
    const qrValue = element.value === "card_token" ? String(qso.public_id ?? "") : publicUrl;
    const dataUrl = await QRCode.toDataURL(qrValue, { margin: 0, width: Math.max(1, Math.round(element.width * width)) });
    if (typeof Image !== "undefined") {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("QR image failed to load")); image.src = dataUrl; });
      context.drawImage(image, x, y, element.width * width, element.height * height);
    } else {
      context.fillStyle = "#000000";
      context.fillRect(x, y, element.width * width, element.height * height);
    }
  }
}
