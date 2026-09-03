import { parseAdif, type AdifRecord } from "@eqsr/adif-codec";

type ImportApi = { createJob: (input: Record<string, unknown>) => Promise<{ id: string }>; uploadChunk: (jobId: string, input: { chunk_index: number; [key: string]: unknown }) => Promise<unknown> };
type ImportOptions = { chunkSize?: number; concurrency?: number; session?: boolean };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toQso(record: AdifRecord): Record<string, unknown> {
  const fields = record.fields;
  const lower: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) lower[key.toLowerCase()] = value;
  return { ...lower, station_callsign: lower.station_callsign ?? "", call: lower.call ?? "", qso_date: lower.qso_date ?? "", time_on: lower.time_on ?? "", band: lower.band ?? "", mode: lower.mode ?? "", adif_extra: {} };
}

export async function runImport(file: File, api: ImportApi, options: ImportOptions = {}) {
  const chunkSize = options.chunkSize ?? 40;
  const concurrency = options.concurrency ?? 2;
  const parsed = parseAdif(await file.text());
  if (parsed.errors.some((error) => error.code !== "NON_ASCII_ADI")) throw new Error(parsed.errors[0]?.detail ?? "ADIF parse failed");
  const records = parsed.records.map(toQso);
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
  if (options.session !== false) sessionStorage.setItem("eqsr-import", JSON.stringify({ job_id: job.id, file_sha256: fileSha, last_confirmed_chunk: uploaded.length ? Math.max(...uploaded) : -1 }));
  return { job_id: job.id, total: records.length, chunks: chunks.length };
}
