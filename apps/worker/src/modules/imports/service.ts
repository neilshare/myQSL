import { QsoInputSchema } from "@eqsr/domain";
import { nanoid } from "nanoid";
import { StationRepository } from "../stations/repository";
import { QsoRepository } from "../qsos/repository";
import { DuplicateQsoError, QsoService } from "../qsos/service";
import { ImportRepository } from "./repository";

export type ImportClassification =
  | { index: number; bucket: "ready"; qso_id: number }
  | { index: number; bucket: "warning"; qso_id: number; warnings: string[] }
  | { index: number; bucket: "duplicate"; duplicate_of: number }
  | { index: number; bucket: "rejected"; issues: Array<{ path: string; message: string }> };

export interface ImportChunkCommand { chunk_index: number; checksum: string; idempotency_key: string; records: unknown[]; }
export class ImportConflictError extends Error {}
export class ImportValidationError extends Error {}

export class ImportService {
  private readonly qsos: QsoService;
  constructor(private readonly repository: ImportRepository, db: D1Database, private readonly now: () => number = Date.now) {
    this.qsos = new QsoService(new QsoRepository(db), new StationRepository(db), now);
  }

  async createJob(command: { file_name: string; file_sha256: string; total_records: number }) {
    if (!/^[a-f0-9]{64}$/iu.test(command.file_sha256) || command.total_records < 0 || !Number.isInteger(command.total_records)) throw new ImportValidationError("Invalid import job metadata");
    return this.repository.createJob({ id: nanoid(21), file_name: command.file_name.trim().slice(0, 255), file_sha256: command.file_sha256.toLowerCase(), total_records: command.total_records, now: this.now() });
  }

  async acceptChunk(jobId: string, command: ImportChunkCommand): Promise<{ classifications: ImportClassification[] }> {
    const job = await this.repository.getJob(jobId);
    if (!job) throw new ImportValidationError("Import job not found");
    if (command.records.length > 40) throw new ImportValidationError("A chunk may contain at most 40 records");
    const replay = await this.repository.getChunkByIdempotency(command.idempotency_key);
    if (replay) {
      if (replay.checksum !== command.checksum) throw new ImportConflictError("Idempotency key was reused with a different checksum");
      return JSON.parse(replay.result_json) as { classifications: ImportClassification[] };
    }
    const classifications: ImportClassification[] = [];
    for (const [index, raw] of command.records.entries()) {
      const parsed = QsoInputSchema.safeParse(raw);
      if (!parsed.success) {
        classifications.push({ index, bucket: "rejected", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
        continue;
      }
      try {
        const result = await this.qsos.create(parsed.data, { source: "adif" });
        classifications.push({ index, bucket: "ready", qso_id: result.qso.id });
      } catch (error) {
        if (error instanceof DuplicateQsoError) classifications.push({ index, bucket: "duplicate", duplicate_of: error.duplicateOf });
        else classifications.push({ index, bucket: "rejected", issues: [{ path: "record", message: error instanceof Error ? error.message : "Record could not be stored" }] });
      }
    }
    const result = { classifications };
    await this.repository.saveChunk({ jobId, chunkIndex: command.chunk_index, idempotencyKey: command.idempotency_key, checksum: command.checksum, resultJson: JSON.stringify(result), now: this.now() });
    await this.repository.updateCounts(jobId, { accepted: classifications.filter((item) => item.bucket === "ready").length, warning: classifications.filter((item) => item.bucket === "warning").length, duplicate: classifications.filter((item) => item.bucket === "duplicate").length, rejected: classifications.filter((item) => item.bucket === "rejected").length, now: this.now() });
    return result;
  }

  async complete(jobId: string) {
    const job = await this.repository.complete(jobId, this.now());
    if (!job) throw new ImportValidationError("Import job not found");
    return job;
  }
}
