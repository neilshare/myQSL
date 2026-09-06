function bytesToBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }

export type EncryptedContact = { ciphertext: string; nonce: string; key_version: string };

function keyBytes(keyB64: string): Uint8Array {
  const bytes = base64ToBytes(keyB64);
  if (bytes.byteLength !== 32) throw new Error("PII key must be 32 bytes");
  return bytes;
}
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.slice().buffer as ArrayBuffer; }

export async function encryptContact(email: string, keyVersion: string, keyB64: string): Promise<EncryptedContact> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes(keyB64)), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(nonce) }, key, asArrayBuffer(new TextEncoder().encode(email)));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), nonce: bytesToBase64(nonce), key_version: keyVersion };
}

export async function decryptContact(input: EncryptedContact, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes(keyB64)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(input.nonce)) }, key, asArrayBuffer(base64ToBytes(input.ciphertext)));
  return new TextDecoder().decode(plain);
}

export async function hashRecipient(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(new TextEncoder().encode(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, asArrayBuffer(new TextEncoder().encode(email.trim().toLowerCase())));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@", 2);
  if (!local || !domain) return "***";
  return `${local.length <= 2 ? "*" : `${local[0]}${"*".repeat(Math.min(6, local.length - 2))}${local.at(-1)}`}@${domain}`;
}
