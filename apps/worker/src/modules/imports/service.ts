import {
  calculateChunkChecksum,
  IMPORT_CHUNK_SIZE,
  IMPORT_PROTOCOL_VERSION,
  isSoftDuplicate,
  makeDedupeKey,
  normalizeQso,
  parseQsoTimestamp,
  QsoInputSchema,
  type ImportClassification,
  type ImportJobSummary,
  type SoftDuplicateFields
} from "@myqsl/domain";
import { nanoid } from "nanoid";
import type { QsoInsert } from "../qsos/repository";
import { ImportRepository, type ImportJobRow } from "./repository";

export { type ImportClassification, type ImportJobSummary };

export interface ImportChunkCommand {
  chunk_index: number;
  checksum: string;
  idempotency_key: string;
  records: unknown[];
}

export class ImportConflictError extends Error {}
export class ImportValidationError extends Error {}

async function calculateSimpleChecksum(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class ImportService {
  constructor(
    private readonly repository: ImportRepository,
    _db: D1Database,
    private readonly now: () => number = Date.now
  ) {}

  async createJob(command: {
    file_name: string;
    file_sha256: string;
    total_records: number;
  }): Promise<ImportJobRow> {
    if (
      !/^[a-f0-9]{64}$/iu.test(command.file_sha256) ||
      command.total_records < 0 ||
      !Number.isInteger(command.total_records)
    ) {
      throw new ImportValidationError("Invalid import job metadata");
    }

    return this.repository.createJob({
      id: nanoid(21),
      file_name: command.file_name.trim().slice(0, 255),
      file_sha256: command.file_sha256.toLowerCase(),
      total_records: command.total_records,
      chunk_size: IMPORT_CHUNK_SIZE,
      protocol_version: IMPORT_PROTOCOL_VERSION,
      now: this.now()
    });
  }

  async getJobStatus(jobId: string): Promise<ImportJobSummary | null> {
    const job = await this.repository.getJob(jobId);
    if (!job) {
      return null;
    }
    const confirmedChunks = await this.repository.getConfirmedChunks(jobId);
    return {
      id: job.id,
      file_name: job.file_name,
      file_sha256: job.file_sha256,
      total_records: job.total_records,
      chunk_size: job.chunk_size,
      protocol_version: job.protocol_version,
      status: job.status,
      counts: {
        accepted: job.accepted_count,
        warning: job.warning_count,
        duplicate: job.duplicate_count,
        rejected: job.rejected_count,
        processed: job.accepted_count + job.warning_count + job.duplicate_count + job.rejected_count
      },
      confirmed_chunks: confirmedChunks,
      created_at: job.created_at,
      updated_at: job.updated_at,
      completed_at: job.completed_at
    };
  }

  async acceptChunk(
    jobId: string,
    command: ImportChunkCommand,
    actor = "system",
    requestId = "system"
  ): Promise<{ classifications: ImportClassification[] }> {
    const job = await this.repository.getJob(jobId);
    if (!job) {
      throw new ImportValidationError("Import job not found");
    }

    const totalChunks = job.total_records === 0 ? 0 : Math.ceil(job.total_records / job.chunk_size);
    if (job.total_records === 0) {
      throw new ImportValidationError("A job with 0 records does not accept chunks");
    }
    if (command.chunk_index < 0 || command.chunk_index >= totalChunks) {
      throw new ImportValidationError(`Chunk index out of bounds: expected 0..${totalChunks - 1}`);
    }

    // Check replay by idempotency key
    const replayByIdem = await this.repository.getChunkByIdempotency(command.idempotency_key);
    if (replayByIdem) {
      if (
        replayByIdem.checksum.toLowerCase() !== command.checksum.toLowerCase() ||
        replayByIdem.job_id !== jobId ||
        replayByIdem.chunk_index !== command.chunk_index
      ) {
        throw new ImportConflictError("Idempotency key was reused with conflicting chunk parameters");
      }
      const parsed = JSON.parse(replayByIdem.result_json);
      return Array.isArray(parsed) ? { classifications: parsed } : parsed;
    }

    // Check replay by chunk_index
    const existingChunk = await this.repository.getChunk(jobId, command.chunk_index);
    if (existingChunk) {
      if (existingChunk.checksum.toLowerCase() !== command.checksum.toLowerCase()) {
        throw new ImportConflictError("Chunk index was submitted with a different checksum");
      }
      const parsed = JSON.parse(existingChunk.result_json);
      return Array.isArray(parsed) ? { classifications: parsed } : parsed;
    }

    // Completed job cannot accept new chunks
    if (job.status === "completed") {
      throw new ImportConflictError("Cannot upload new chunks to a completed import job");
    }

    // Sequential submission verification
    if (command.chunk_index > 0) {
      const prevChunk = await this.repository.getChunk(jobId, command.chunk_index - 1);
      if (!prevChunk) {
        throw new ImportValidationError(
          `Chunks must be submitted sequentially. Chunk ${command.chunk_index - 1} has not been received yet.`
        );
      }
    }

    // Chunk size verification
    const isTail = command.chunk_index === totalChunks - 1;
    const expectedLength = isTail
      ? job.total_records % job.chunk_size === 0
        ? job.chunk_size
        : job.total_records % job.chunk_size
      : job.chunk_size;
    if (command.records.length !== expectedLength) {
      throw new ImportValidationError(
        `Invalid chunk size: expected ${expectedLength} records, got ${command.records.length}`
      );
    }

    // Server-side checksum recalculation and verification
    const expectedCanonical = await calculateChunkChecksum(command.records);
    const expectedSimple = await calculateSimpleChecksum(JSON.stringify(command.records));
    const normalizedInputChecksum = command.checksum.trim().toLowerCase();
    if (
      normalizedInputChecksum !== expectedCanonical.toLowerCase() &&
      normalizedInputChecksum !== expectedSimple.toLowerCase()
    ) {
      throw new ImportValidationError("Checksum mismatch: chunk data does not match provided checksum");
    }

    // Read phase: prefetch stations and existing QSO candidates
    const candidateCalls: string[] = [];
    const candidateStationCalls: string[] = [];
    for (const raw of command.records) {
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.call === "string") candidateCalls.push(obj.call);
        if (typeof obj.station_callsign === "string") candidateStationCalls.push(obj.station_callsign);
      }
    }

    const stationsMap = await this.repository.findStations(candidateStationCalls);
    const defaultStation = stationsMap.get("__default__");
    const existingQsoCandidates = await this.repository.findExistingQsoCandidates(candidateCalls);

    // Classify each record
    const rawClassifications: Array<{
      index: number;
      dedupe_key: string | null;
      duplicate_ordinal: number;
      bucket: "ready" | "warning" | "duplicate" | "rejected";
      duplicate_of: number | null;
      warnings: string[] | null;
      issues: Array<{ path: string; message: string }> | null;
    }> = [];

    const qsoInserts: QsoInsert[] = [];
    const seenInBatchDedupeKeys = new Map<string, number>();
    const seenInBatchRecords: Array<{ candidate: SoftDuplicateFields; index: number }> = [];
    const currentTime = this.now();

    for (const [index, raw] of command.records.entries()) {
      const parsed = QsoInputSchema.safeParse(raw);
      if (!parsed.success) {
        rawClassifications.push({
          index,
          dedupe_key: null,
          duplicate_ordinal: 0,
          bucket: "rejected",
          duplicate_of: null,
          warnings: null,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
        continue;
      }

      // Station resolution
      const targetStationCall = parsed.data.station_callsign || defaultStation?.callsign;
      const station = targetStationCall ? stationsMap.get(targetStationCall.toUpperCase()) : undefined;
      if (!station) {
        rawClassifications.push({
          index,
          dedupe_key: null,
          duplicate_ordinal: 0,
          bucket: "rejected",
          duplicate_of: null,
          warnings: null,
          issues: [
            {
              path: "station_callsign",
              message: "Station not found and no default station configured"
            }
          ]
        });
        continue;
      }

      const normalized = normalizeQso({ ...parsed.data, station_callsign: station.callsign });
      const dedupeKey = await makeDedupeKey(normalized);

      // Hard duplicate check (DB first, then current batch)
      const dbHardDup = existingQsoCandidates.find((q) => q.dedupe_key === dedupeKey);
      if (dbHardDup) {
        rawClassifications.push({
          index,
          dedupe_key: dedupeKey,
          duplicate_ordinal: 0,
          bucket: "duplicate",
          duplicate_of: dbHardDup.id,
          warnings: null,
          issues: null
        });
        continue;
      }

      if (seenInBatchDedupeKeys.has(dedupeKey)) {
        rawClassifications.push({
          index,
          dedupe_key: dedupeKey,
          duplicate_ordinal: 0,
          bucket: "duplicate",
          duplicate_of: null,
          warnings: null,
          issues: null
        });
        continue;
      }

      // Soft duplicate check (+-180s)
      const candidateFields: SoftDuplicateFields = {
        station_callsign: station.callsign,
        call: normalized.call,
        qso_date: normalized.qso_date,
        time_on: normalized.time_on,
        band: normalized.band,
        mode: normalized.mode
      };

      const dbSoftDup = existingQsoCandidates.find((q) => isSoftDuplicate(candidateFields, q));
      const batchSoftDup = seenInBatchRecords.find((item) => isSoftDuplicate(candidateFields, item.candidate));
      const isSoft = Boolean(dbSoftDup || batchSoftDup);
      const bucket = isSoft ? "warning" : "ready";
      const warnings = isSoft ? ["Soft duplicate detected within 180 seconds window"] : null;

      seenInBatchDedupeKeys.set(dedupeKey, index);
      seenInBatchRecords.push({ candidate: candidateFields, index });

      rawClassifications.push({
        index,
        dedupe_key: dedupeKey,
        duplicate_ordinal: 0,
        bucket,
        duplicate_of: null,
        warnings,
        issues: null
      });

      qsoInserts.push({
        station_id: station.id,
        station_callsign: station.callsign,
        call: normalized.call,
        qso_date: normalized.qso_date,
        time_on: normalized.time_on,
        qso_at: parseQsoTimestamp(normalized.qso_date, normalized.time_on),
        band: normalized.band,
        freq_hz: normalized.freq_hz,
        mode: normalized.mode,
        submode: normalized.submode,
        rst_sent: normalized.rst_sent,
        rst_rcvd: normalized.rst_rcvd,
        gridsquare: normalized.gridsquare,
        name: normalized.name,
        qth: normalized.qth,
        comment: normalized.comment,
        adif_extra_json: JSON.stringify(normalized.adif_extra),
        dedupe_key: dedupeKey,
        duplicate_ordinal: 0,
        source: "adif",
        created_at: currentTime,
        updated_at: currentTime
      });
    }

    const countsDelta = {
      accepted: rawClassifications.filter((r) => r.bucket === "ready").length,
      warning: rawClassifications.filter((r) => r.bucket === "warning").length,
      duplicate: rawClassifications.filter((r) => r.bucket === "duplicate").length,
      rejected: rawClassifications.filter((r) => r.bucket === "rejected").length
    };

    try {
      const batchResult = await this.repository.executeChunkBatch({
        jobId,
        chunkIndex: command.chunk_index,
        idempotencyKey: command.idempotency_key,
        checksum: command.checksum,
        recordsCount: command.records.length,
        now: currentTime,
        actor,
        requestId,
        qsoInserts,
        rawClassifications,
        countsDelta
      });

      return {
        classifications: JSON.parse(batchResult.result_json) as ImportClassification[]
      };
    } catch (error) {
      // Bounded fallback read on constraint race
      const fallbackChunk = await this.repository.getChunk(jobId, command.chunk_index);
      if (fallbackChunk) {
        if (fallbackChunk.checksum.toLowerCase() === command.checksum.toLowerCase()) {
          const parsed = JSON.parse(fallbackChunk.result_json);
          return Array.isArray(parsed) ? { classifications: parsed } : parsed;
        }
        throw new ImportConflictError("Chunk index was submitted concurrently with a different checksum");
      }

      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE constraint failed: qsos")) {
        throw new ImportConflictError("Concurrent QSO conflict detected, please retry chunk");
      }
      throw error;
    }
  }

  async complete(jobId: string, _actor = "system"): Promise<ImportJobRow> {
    const job = await this.repository.getJob(jobId);
    if (!job) {
      throw new ImportValidationError("Import job not found");
    }
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new ImportValidationError("Cannot complete a failed import job");
    }

    const expectedChunks = job.total_records === 0 ? 0 : Math.ceil(job.total_records / job.chunk_size);
    const processed = job.accepted_count + job.warning_count + job.duplicate_count + job.rejected_count;
    if (processed !== job.total_records) {
      throw new ImportValidationError(
        `Cannot complete: processed records (${processed}) does not match total records (${job.total_records})`
      );
    }

    const completed = await this.repository.complete(jobId, this.now(), expectedChunks, job.total_records);
    if (!completed || completed.status !== "completed") {
      throw new ImportValidationError(
        "Cannot complete import job: incomplete, non-sequential, or corrupted chunks"
      );
    }
    return completed;
  }
}
