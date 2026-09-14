import { nanoid } from "nanoid";
import { MediaStore } from "../../platform/r2";
import { TemplateRepository, type TemplateAssetRow } from "./repository";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 24 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export type InspectedImage = { mime: "image/png" | "image/jpeg"; width: number; height: number };

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 24 && PNG_SIGNATURE.every((value, index) => bytes[index] === value) && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR";
}

function inspectPng(bytes: Uint8Array): InspectedImage | null {
  if (!isPng(bytes)) return null;
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  return width > 0 && height > 0 ? { mime: "image/png", width, height } : null;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function inspectJpeg(bytes: Uint8Array): InspectedImage | null {
  if (!isJpeg(bytes)) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width > 0 && height > 0) return { mime: "image/jpeg", width, height };
    }
    offset += segmentLength;
  }
  return null;
}

export function inspectImage(bytes: Uint8Array, contentType: string): InspectedImage {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new Error("Asset exceeds 8 MiB");
  const inspected = inspectPng(bytes) ?? inspectJpeg(bytes);
  if (!inspected) throw new Error("Only complete PNG/JPEG images are supported");
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== inspected.mime) throw new Error("Content-Type does not match image signature");
  if (inspected.width * inspected.height > MAX_PIXELS) throw new Error("Image exceeds 24 megapixels");
  return inspected;
}

export async function sha256Hex(body: ArrayBuffer | Uint8Array): Promise<string> {
  const source = body instanceof Uint8Array ? body.slice().buffer : body;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class TemplateAssetService {
  constructor(private readonly repository: TemplateRepository, private readonly media: MediaStore, private readonly now: () => number = Date.now) {}

  async upload(templateId: number, body: ArrayBuffer, contentType: string): Promise<TemplateAssetRow> {
    const inspected = inspectImage(new Uint8Array(body), contentType);
    const sha256 = await sha256Hex(body);
    const existing = await this.repository.getAssetByHash(templateId, sha256);
    if (existing) return existing;
    const extension = inspected.mime === "image/png" ? "png" : "jpg";
    const key = `templates/${templateId}/assets/${sha256}.${extension}`;
    await this.media.putImmutable(key, body, inspected.mime);
    return this.repository.insertAsset({
      id: `asset_${nanoid(16)}`,
      template_id: templateId,
      r2_key: key,
      sha256,
      mime: inspected.mime,
      width: inspected.width,
      height: inspected.height,
      byte_size: body.byteLength,
      created_at: this.now()
    });
  }
}
