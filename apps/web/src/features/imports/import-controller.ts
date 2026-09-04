import { parseAdif } from "@myqsl/adif-codec";
import { recordToQso } from "./adif-mapper";

type ImportApi = {
  createJob: (input: Record<string, unknown>) => Promise<{ id: string }>;
  uploadChunk: (jobId: string, input: { chunk_index: number; records: unknown[]; [key: string]: unknown }) => Promise<unknown>;
  completeJob?: (jobId: string) => Promise<unknown>;
};
type ImportOptions = { chunkSize?: number; concurrency?: number; session?: boolean };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function runImport(file: File, api: ImportApi, options: ImportOptions = {}) {
  const chunkSize = options.chunkSize ?? 40;
  const concurrency = options.concurrency ?? 2;
  const parsed = parseAdif(await file.text());
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0]?.detail ?? "ADIF parse failed");
  const records = parsed.records.map(recordToQso);
  const fileSha = await sha256(await file.text());
  const job = await api.createJob({ file_name: file.name, file_sha256: fileSha, total_records: records.length });
  const chunks = Array.from({ length: Math.ceil(records.length / chunkSize) }, (_, index) => records.slice(index * chunkSize, (index + 1) * chunkSize));
  const payloads = await Promise.all(chunks.map(async (chunk, index) => ({ index, chunk, checksum: await sha256(JSON.stringify(chunk)) })));
  const uploaded: number[] = [];
  for (let start = 0; start < chunks.length; start += concurrency) {
    await Promise.all(payloads.slice(start, start + concurrency).map(async ({ index, chunk, checksum }) => {
      await api.uploadChunk(job.id, { chunk_index: index, checksum, idempotency_key: `${job.id}-${index}`, records: chunk });
      uploaded.push(index);
    }));
  }
  if (typeof api.completeJob === "function") {
    await api.completeJob(job.id);
  }
  if (options.session !== false) sessionStorage.setItem("myqsl-import", JSON.stringify({ job_id: job.id, file_sha256: fileSha, last_confirmed_chunk: uploaded.length ? Math.max(...uploaded) : -1 }));
  return { job_id: job.id, total: records.length, chunks: chunks.length };
}
