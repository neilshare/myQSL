export interface ImportJobRow { id: string; file_name: string; file_sha256: string; total_records: number; accepted_count: number; warning_count: number; duplicate_count: number; rejected_count: number; status: string; created_at: number; updated_at: number; }

export class ImportRepository {
  constructor(private readonly db: D1Database) {}

  async createJob(job: { id: string; file_name: string; file_sha256: string; total_records: number; now: number }): Promise<ImportJobRow> {
    await this.db.prepare("INSERT INTO import_jobs (id, file_name, file_sha256, total_records, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'created', ?, ?)").bind(job.id, job.file_name, job.file_sha256, job.total_records, job.now, job.now).run();
    return this.getJob(job.id) as Promise<ImportJobRow>;
  }

  getJob(id: string): Promise<ImportJobRow | null> {
    return this.db.prepare("SELECT * FROM import_jobs WHERE id = ?").bind(id).first<ImportJobRow>();
  }

  getChunkByIdempotency(idempotencyKey: string): Promise<{ checksum: string; result_json: string } | null> {
    return this.db.prepare("SELECT checksum, result_json FROM import_chunks WHERE idempotency_key = ?").bind(idempotencyKey).first<{ checksum: string; result_json: string }>();
  }

  async saveChunk(input: { jobId: string; chunkIndex: number; idempotencyKey: string; checksum: string; resultJson: string; now: number }): Promise<void> {
    await this.db.prepare("INSERT INTO import_chunks (job_id, chunk_index, idempotency_key, checksum, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(input.jobId, input.chunkIndex, input.idempotencyKey, input.checksum, input.resultJson, input.now).run();
  }

  async updateCounts(id: string, counts: { accepted: number; warning: number; duplicate: number; rejected: number; now: number }): Promise<void> {
    await this.db.prepare("UPDATE import_jobs SET accepted_count = accepted_count + ?, warning_count = warning_count + ?, duplicate_count = duplicate_count + ?, rejected_count = rejected_count + ?, status = 'running', updated_at = ? WHERE id = ?").bind(counts.accepted, counts.warning, counts.duplicate, counts.rejected, counts.now, id).run();
  }

  async complete(id: string, now: number): Promise<ImportJobRow | null> {
    await this.db.prepare("UPDATE import_jobs SET status = 'completed', updated_at = ? WHERE id = ?").bind(now, id).run();
    return this.getJob(id);
  }
}
