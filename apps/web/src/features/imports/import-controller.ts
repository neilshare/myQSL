import { parseAdif } from "@myqsl/adif-codec";
import { calculateChunkChecksum, IMPORT_CHUNK_SIZE, type ImportJobSummary } from "@myqsl/domain";
import { recordToQso } from "./adif-mapper";

export type ImportApi = {
  createJob: (input: { file_name: string; file_sha256: string; total_records: number }) => Promise<{ id: string } | { data: { id: string } }>;
  uploadChunk: (
    jobId: string,
    input: { chunk_index: number; checksum: string; idempotency_key: string; records: unknown[] }
  ) => Promise<{ classifications?: Array<{ bucket: string }> } | unknown>;
  completeJob?: (jobId: string) => Promise<unknown>;
  getJob?: (jobId: string) => Promise<ImportJobSummary | { data: ImportJobSummary }>;
};

export interface ImportProgress {
  currentChunk: number;
  totalChunks: number;
  processedRecords: number;
  totalRecords: number;
  counts: {
    ready: number;
    warning: number;
    duplicate: number;
    rejected: number;
  };
}

export type ImportOptions = {
  chunkSize?: number;
  concurrency?: number;
  session?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function parseAdifAsync(file: File, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  if (signal?.aborted) {
    throw new Error("Import aborted by user");
  }

  // Fallback to synchronous parsing if Web Worker is unavailable (e.g. node/test environments)
  if (typeof Worker === "undefined" || typeof window === "undefined") {
    const fileContent = await file.text();
    const parsed = parseAdif(fileContent);
    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.detail ?? "ADIF parse failed");
    }
    return parsed.records.map(recordToQso);
  }

  const buffer = await file.arrayBuffer();
  if (signal?.aborted) {
    throw new Error("Import aborted by user");
  }

  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./adif-parser.worker.ts", import.meta.url), { type: "module" });
    } catch {
      // If worker creation fails, fallback to main thread
      file.text().then((text) => {
        const parsed = parseAdif(text);
        if (parsed.errors.length > 0) reject(new Error(parsed.errors[0]?.detail ?? "ADIF parse failed"));
        else resolve(parsed.records.map(recordToQso));
      }).catch(reject);
      return;
    }

    const onAbort = () => {
      worker?.terminate();
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Import aborted by user"));
    };

    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<{ type: string; records?: Record<string, unknown>[]; error?: string }>) => {
      worker?.terminate();
      signal?.removeEventListener("abort", onAbort);
      if (event.data.type === "done" && event.data.records) {
        resolve(event.data.records);
      } else {
        reject(new Error(event.data.error || "ADIF parse failed"));
      }
    };

    worker.onerror = (err) => {
      worker?.terminate();
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(err.message || "Web Worker error"));
    };

    // Transfer buffer with zero-copy
    worker.postMessage({ buffer }, [buffer]);
  });
}

export async function runImport(file: File, api: ImportApi, options: ImportOptions = {}) {
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds maximum allowed size of 50MB");
  }

  // The server import protocol enforces sequential chunk verification (chunk N requires chunk N-1).
  // Therefore, chunk uploads are executed strictly in sequential order (concurrency = 1).
  const chunkSize = IMPORT_CHUNK_SIZE;
  const signal = options.signal;

  if (signal?.aborted) {
    throw new Error("Import aborted by user");
  }

  const records = await parseAdifAsync(file, signal);
  const fileText = await file.text();
  const fileSha = await sha256(fileText);

  let jobId: string | null = null;
  const confirmedChunks = new Set<number>();
  const counts = { ready: 0, warning: 0, duplicate: 0, rejected: 0 };

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
            counts.ready = remoteJob.counts.accepted;
            counts.warning = remoteJob.counts.warning;
            counts.duplicate = remoteJob.counts.duplicate;
            counts.rejected = remoteJob.counts.rejected;
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

  for (const { index, chunk, checksum } of payloads) {
    if (signal?.aborted) {
      throw new Error("Import aborted by user");
    }
    if (confirmedChunks.has(index)) {
      continue;
    }
    const res = await api.uploadChunk(jobId!, {
      chunk_index: index,
      checksum,
      idempotency_key: `${jobId}-${index}`,
      records: chunk
    });

    // Accumulate classifications if returned by server (do not fail-open)
    if (res && typeof res === "object" && "classifications" in res && Array.isArray((res as any).classifications)) {
      for (const item of (res as any).classifications) {
        if (item.bucket === "ready") counts.ready++;
        else if (item.bucket === "warning") counts.warning++;
        else if (item.bucket === "duplicate") counts.duplicate++;
        else if (item.bucket === "rejected") counts.rejected++;
      }
    }

    if (signal?.aborted) {
      throw new Error("Import aborted by user");
    }

    confirmedChunks.add(index);
    uploadedIndices.push(index);

    options.onProgress?.({
      currentChunk: confirmedChunks.size,
      totalChunks,
      processedRecords: Math.min(confirmedChunks.size * chunkSize, records.length),
      totalRecords: records.length,
      counts: { ...counts }
    });
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

  return {
    job_id: jobId,
    total: records.length,
    chunks: chunks.length,
    counts: { ...counts }
  };
}
