import { parseAdif } from "@myqsl/adif-codec";
import { calculateChunkChecksum, IMPORT_CHUNK_SIZE, type ImportJobSummary } from "@myqsl/domain";
import { recordToQso } from "./adif-mapper";

export type ImportApi = {
  createJob: (input: { file_name: string; file_sha256: string; total_records: number }) => Promise<{ id: string } | { data: { id: string } }>;
  uploadChunk: (
    jobId: string,
    input: { chunk_index: number; checksum: string; idempotency_key: string; records: unknown[] }
  ) => Promise<unknown>;
  completeJob?: (jobId: string) => Promise<unknown>;
  getJob?: (jobId: string) => Promise<ImportJobSummary | { data: ImportJobSummary }>;
};

export type ImportOptions = {
  chunkSize?: number;
  concurrency?: number;
  session?: boolean;
  signal?: AbortSignal;
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function runImport(file: File, api: ImportApi, options: ImportOptions = {}) {
  const chunkSize = options.chunkSize ?? IMPORT_CHUNK_SIZE;
  const concurrency = options.concurrency ?? 1;
  const signal = options.signal;

  if (signal?.aborted) {
    throw new Error("Import aborted by user");
  }

  const fileContent = await file.text();
  const parsed = parseAdif(fileContent);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.detail ?? "ADIF parse failed");
  }

  const records = parsed.records.map(recordToQso);
  const fileSha = await sha256(fileContent);

  let jobId: string | null = null;
  const confirmedChunks = new Set<number>();

  // Check sessionStorage for resumable session
  if (options.session !== false && typeof sessionStorage !== "undefined") {
    try {
      const savedRaw = sessionStorage.getItem("myqsl-import");
      if (savedRaw) {
        const saved = JSON.parse(savedRaw) as { job_id: string; file_sha256: string };
        if (saved.file_sha256 === fileSha && typeof api.getJob === "function") {
          const remoteJobRes = await api.getJob(saved.job_id);
          const remoteJob = ("data" in remoteJobRes ? remoteJobRes.data : remoteJobRes) as ImportJobSummary;
          if (
            remoteJob &&
            remoteJob.file_sha256 === fileSha &&
            remoteJob.total_records === records.length &&
            remoteJob.status !== "failed"
          ) {
            jobId = remoteJob.id;
            for (const chunk of remoteJob.confirmed_chunks) {
              confirmedChunks.add(chunk.chunk_index);
            }
          }
        }
      }
    } catch {
      // Ignore session restore error and create fresh job
    }
  }

  if (!jobId) {
    const createdRes = await api.createJob({
      file_name: file.name,
      file_sha256: fileSha,
      total_records: records.length
    });
    jobId = "data" in createdRes ? createdRes.data.id : createdRes.id;
  }

  const totalChunks = records.length === 0 ? 0 : Math.ceil(records.length / chunkSize);
  const chunks = Array.from({ length: totalChunks }, (_, index) =>
    records.slice(index * chunkSize, (index + 1) * chunkSize)
  );

  const payloads = await Promise.all(
    chunks.map(async (chunk, index) => ({
      index,
      chunk,
      checksum: await calculateChunkChecksum(chunk)
    }))
  );

  const uploadedIndices: number[] = Array.from(confirmedChunks);

  for (let start = 0; start < payloads.length; start += concurrency) {
    if (signal?.aborted) {
      throw new Error("Import aborted by user");
    }
    const batch = payloads.slice(start, start + concurrency);
    await Promise.all(
      batch.map(async ({ index, chunk, checksum }) => {
        if (confirmedChunks.has(index)) {
          return;
        }
        await api.uploadChunk(jobId!, {
          chunk_index: index,
          checksum,
          idempotency_key: `${jobId}-${index}`,
          records: chunk
        });
        confirmedChunks.add(index);
        uploadedIndices.push(index);
      })
    );
  }

  if (signal?.aborted) {
    throw new Error("Import aborted by user");
  }

  if (typeof api.completeJob === "function") {
    await api.completeJob(jobId);
  }

  if (options.session !== false && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(
      "myqsl-import",
      JSON.stringify({
        job_id: jobId,
        file_sha256: fileSha,
        last_confirmed_chunk: uploadedIndices.length ? Math.max(...uploadedIndices) : -1
      })
    );
  }

  return { job_id: jobId, total: records.length, chunks: chunks.length };
}
