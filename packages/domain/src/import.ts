export const IMPORT_PROTOCOL_VERSION = 1;
export const IMPORT_CHUNK_SIZE = 40;

function deterministicSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(deterministicSerialize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${deterministicSerialize(obj[k])}`).join(",")}}`;
}

export async function calculateChunkChecksum(records: unknown[]): Promise<string> {
  const canonicalJson = deterministicSerialize(records);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ImportClassification =
  | { index: number; bucket: "ready"; qso_id: number; duplicate_of: null; warnings: null; issues: null }
  | { index: number; bucket: "warning"; qso_id: number; duplicate_of: null; warnings: string[]; issues: null }
  | { index: number; bucket: "duplicate"; qso_id: null; duplicate_of: number; warnings: null; issues: null }
  | { index: number; bucket: "rejected"; qso_id: null; duplicate_of: null; warnings: null; issues: Array<{ path: string; message: string }> };

export interface ImportJobSummary {
  id: string;
  file_name: string;
  file_sha256: string;
  total_records: number;
  chunk_size: number;
  protocol_version: number;
  status: "created" | "running" | "completed" | "failed";
  counts: {
    accepted: number;
    warning: number;
    duplicate: number;
    rejected: number;
    processed: number;
  };
  confirmed_chunks: Array<{
    chunk_index: number;
    checksum: string;
    records_count: number;
  }>;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}
