import { z } from "zod";

const CursorSchema = z
  .object({ qso_at: z.number().int().nonnegative(), id: z.number().int().positive() })
  .strict();
export type Cursor = z.infer<typeof CursorSchema>;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Malformed cursor encoding");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Malformed cursor encoding");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify(CursorSchema.parse(cursor)));
}

export function decodeCursor(value: string): Cursor {
  if (value.length > 256) throw new Error("Cursor is too large");
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(value));
  } catch {
    throw new Error("Malformed cursor");
  }
  return CursorSchema.parse(payload);
}
