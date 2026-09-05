import type { QsoInsert } from "../qsos/repository";
import { buildConditionalAuditStatement } from "../../platform/audit";

export interface ImportJobRow {
  id: string;
  file_name: string;
  file_sha256: string;
  total_records: number;
  chunk_size: number;
  protocol_version: number;
  accepted_count: number;
  warning_count: number;
  duplicate_count: number;
  rejected_count: number;
  status: "created" | "running" | "completed" | "failed";
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ImportChunkRow {
  id: number;
  job_id: string;
  chunk_index: number;
  idempotency_key: string;
  checksum: string;
  result_json: string;
  records_count: number;
  created_at: number;
}

export interface ExecuteChunkBatchInput {
  jobId: string;
  chunkIndex: number;
  idempotencyKey: string;
  checksum: string;
  recordsCount: number;
  now: number;
  actor: string;
  requestId: string;
  qsoInserts: QsoInsert[];
  rawClassifications: Array<{
    index: number;
    dedupe_key: string | null;
    duplicate_ordinal: number;
    bucket: "ready" | "warning" | "duplicate" | "rejected";
    duplicate_of: number | null;
    warnings: string[] | null;
    issues: Array<{ path: string; message: string }> | null;
  }>;
  countsDelta: {
    accepted: number;
    warning: number;
    duplicate: number;
    rejected: number;
  };
}

export class ImportRepository {
  constructor(private readonly db: D1Database) {}

  async createJob(job: {
    id: string;
    file_name: string;
    file_sha256: string;
    total_records: number;
    chunk_size: number;
    protocol_version: number;
    now: number;
  }): Promise<ImportJobRow> {
    await this.db
      .prepare(
        `INSERT INTO import_jobs (
          id, file_name, file_sha256, total_records, chunk_size, protocol_version,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?)`
      )
      .bind(
        job.id,
        job.file_name,
        job.file_sha256,
        job.total_records,
        job.chunk_size,
        job.protocol_version,
        job.now,
        job.now
      )
      .run();
    return (await this.getJob(job.id)) as ImportJobRow;
  }

  getJob(id: string): Promise<ImportJobRow | null> {
    return this.db.prepare("SELECT * FROM import_jobs WHERE id = ?").bind(id).first<ImportJobRow>();
  }

  getChunk(jobId: string, chunkIndex: number): Promise<ImportChunkRow | null> {
    return this.db
      .prepare("SELECT * FROM import_chunks WHERE job_id = ? AND chunk_index = ?")
      .bind(jobId, chunkIndex)
      .first<ImportChunkRow>();
  }

  getChunkByIdempotency(idempotencyKey: string): Promise<ImportChunkRow | null> {
    return this.db
      .prepare("SELECT * FROM import_chunks WHERE idempotency_key = ?")
      .bind(idempotencyKey)
      .first<ImportChunkRow>();
  }

  async getConfirmedChunks(jobId: string): Promise<Array<{ chunk_index: number; checksum: string; records_count: number }>> {
    const result = await this.db
      .prepare("SELECT chunk_index, checksum, records_count FROM import_chunks WHERE job_id = ? ORDER BY chunk_index ASC")
      .bind(jobId)
      .all<{ chunk_index: number; checksum: string; records_count: number }>();
    return result.results;
  }

  async getDefaultStation(): Promise<{ id: number; callsign: string } | null> {
    return this.db
      .prepare("SELECT id, callsign FROM stations WHERE is_default = 1 LIMIT 1")
      .first<{ id: number; callsign: string }>();
  }

  async findStations(callsigns: string[]): Promise<Map<string, { id: number; callsign: string }>> {
    const map = new Map<string, { id: number; callsign: string }>();
    const defaultStation = await this.getDefaultStation();
    if (defaultStation) {
      map.set("__default__", defaultStation);
      map.set(defaultStation.callsign.toUpperCase(), defaultStation);
    }
    const cleanCalls = Array.from(new Set(callsigns.map((c) => c.trim().toUpperCase()))).filter(Boolean);
    if (cleanCalls.length === 0) {
      return map;
    }
    const placeholders = cleanCalls.map(() => "?").join(",");
    const result = await this.db
      .prepare(`SELECT id, callsign FROM stations WHERE UPPER(callsign) IN (${placeholders})`)
      .bind(...cleanCalls)
      .all<{ id: number; callsign: string }>();
    for (const row of result.results) {
      map.set(row.callsign.toUpperCase(), row);
    }
    return map;
  }

  async findExistingQsoCandidates(calls: string[]): Promise<
    Array<{
      id: number;
      call: string;
      station_callsign: string;
      band: string;
      mode: string;
      qso_date: string;
      time_on: string;
      qso_at: number;
      dedupe_key: string;
    }>
  > {
    const cleanCalls = Array.from(new Set(calls.map((c) => c.trim().toUpperCase()))).filter(Boolean);
    if (cleanCalls.length === 0) {
      return [];
    }
    const placeholders = cleanCalls.map(() => "?").join(",");
    const result = await this.db
      .prepare(
        `SELECT id, call, station_callsign, band, mode, qso_date, time_on, qso_at, dedupe_key
         FROM qsos
         WHERE UPPER(call) IN (${placeholders}) AND deleted_at IS NULL
         ORDER BY qso_at DESC
         LIMIT 1000`
      )
      .bind(...cleanCalls)
      .all<{
        id: number;
        call: string;
        station_callsign: string;
        band: string;
        mode: string;
        qso_date: string;
        time_on: string;
        qso_at: number;
        dedupe_key: string;
      }>();
    return result.results;
  }

  async executeChunkBatch(input: ExecuteChunkBatchInput): Promise<{ result_json: string }> {
    const statements: D1PreparedStatement[] = [];

    // 0. Pre-condition guard: Abort transaction immediately if job is not in created/running status
    const statusGuardSql = `SELECT CASE
      WHEN (SELECT status FROM import_jobs WHERE id = ? AND status IN ('created', 'running')) IS NOT NULL
      THEN json('{}')
      ELSE json('ERROR_IMPORT_JOB_NOT_WRITABLE')
    END`;
    statements.push(this.db.prepare(statusGuardSql).bind(input.jobId));

    // 1. Group QSO inserts (at most 4 rows per INSERT statement to keep parameters <= 88 <= 100)
    const ROWS_PER_STMT = 4;
    for (let i = 0; i < input.qsoInserts.length; i += ROWS_PER_STMT) {
      const group = input.qsoInserts.slice(i, i + ROWS_PER_STMT);
      const rowPlaceholders = group
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const sql = `INSERT INTO qsos (
        station_id, station_callsign, call, qso_date, time_on, qso_at,
        band, freq_hz, mode, submode, rst_sent, rst_rcvd, gridsquare,
        name, qth, comment, adif_extra_json, dedupe_key, duplicate_ordinal,
        source, created_at, updated_at
      ) VALUES ${rowPlaceholders} RETURNING id, dedupe_key, duplicate_ordinal`;

      const binds: unknown[] = [];
      for (const row of group) {
        binds.push(
          row.station_id,
          row.station_callsign,
          row.call,
          row.qso_date,
          row.time_on,
          row.qso_at,
          row.band,
          row.freq_hz,
          row.mode,
          row.submode,
          row.rst_sent,
          row.rst_rcvd,
          row.gridsquare,
          row.name,
          row.qth,
          row.comment,
          row.adif_extra_json,
          row.dedupe_key,
          row.duplicate_ordinal,
          row.source,
          row.created_at,
          row.updated_at
        );
      }
      statements.push(this.db.prepare(sql).bind(...binds));
    }

    // 2. Insert import_chunks with json_each and RETURNING result_json
    const chunkInsertSql = `INSERT INTO import_chunks (
      job_id, chunk_index, idempotency_key, checksum, result_json, records_count, created_at
    )
    SELECT
      ?, ?, ?, ?,
      json_group_array(
        json_object(
          'index', json_extract(value, '$.index'),
          'bucket', json_extract(value, '$.bucket'),
          'qso_id', CASE WHEN json_extract(value, '$.bucket') IN ('ready', 'warning') THEN q.id ELSE NULL END,
          'duplicate_of', json_extract(value, '$.duplicate_of'),
          'warnings', json_extract(value, '$.warnings'),
          'issues', json_extract(value, '$.issues')
        )
      ),
      ?, ?
    FROM json_each(?)
    LEFT JOIN qsos q ON q.dedupe_key = json_extract(value, '$.dedupe_key')
                    AND q.duplicate_ordinal = json_extract(value, '$.duplicate_ordinal')
    RETURNING result_json`;

    const classificationsPayload = JSON.stringify(input.rawClassifications);
    statements.push(
      this.db
        .prepare(chunkInsertSql)
        .bind(
          input.jobId,
          input.chunkIndex,
          input.idempotencyKey,
          input.checksum,
          input.recordsCount,
          input.now,
          classificationsPayload
        )
    );

    // 3. Update job counts and ensure status is running
    const updateJobSql = `UPDATE import_jobs
      SET accepted_count = accepted_count + ?,
          warning_count = warning_count + ?,
          duplicate_count = duplicate_count + ?,
          rejected_count = rejected_count + ?,
          status = 'running',
          updated_at = ?
      WHERE id = ? AND status IN ('created', 'running')`;
    statements.push(
      this.db
        .prepare(updateJobSql)
        .bind(
          input.countsDelta.accepted,
          input.countsDelta.warning,
          input.countsDelta.duplicate,
          input.countsDelta.rejected,
          input.now,
          input.jobId
        )
    );

    // 4. Audit event
    statements.push(
      buildConditionalAuditStatement(this.db, {
        actor: input.actor,
        action: "chunk_imported",
        entity: "import_job",
        entityId: input.jobId,
        requestId: input.requestId,
        detail: {
          chunk_index: input.chunkIndex,
          records_count: input.recordsCount,
          accepted: input.countsDelta.accepted,
          warning: input.countsDelta.warning,
          duplicate: input.countsDelta.duplicate,
          rejected: input.countsDelta.rejected
        },
        createdAt: input.now
      })
    );

    // Execute the transaction batch
    const batchResults = await this.db.batch(statements);
    // Find the chunk insert result which has RETURNING result_json
    const chunkInsertResult = batchResults.find(
      (r) =>
        r.results &&
        r.results.length > 0 &&
        typeof (r.results[0] as Record<string, unknown>).result_json === "string"
    );
    if (!chunkInsertResult || !chunkInsertResult.results || chunkInsertResult.results.length === 0) {
      throw new Error("Failed to persist chunk classification results");
    }
    return chunkInsertResult.results[0] as { result_json: string };
  }

  async complete(id: string, now: number, expectedChunks: number, totalRecords: number): Promise<ImportJobRow | null> {
    const updateSql = `UPDATE import_jobs
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
        AND status IN ('created', 'running')
        AND (accepted_count + warning_count + duplicate_count + rejected_count) = total_records
        AND (
          (? = 0 AND (SELECT COUNT(*) FROM import_chunks WHERE job_id = ?) = 0)
          OR
          (
            ? > 0
            AND (SELECT COUNT(DISTINCT chunk_index) FROM import_chunks WHERE job_id = ?) = ?
            AND (SELECT COALESCE(SUM(records_count), 0) FROM import_chunks WHERE job_id = ?) = ?
            AND (SELECT MIN(chunk_index) FROM import_chunks WHERE job_id = ?) = 0
            AND (SELECT MAX(chunk_index) FROM import_chunks WHERE job_id = ?) = ? - 1
          )
        )`;

    await this.db
      .prepare(updateSql)
      .bind(
        now,
        now,
        id,
        totalRecords,
        id,
        totalRecords,
        id,
        expectedChunks,
        id,
        totalRecords,
        id,
        id,
        expectedChunks
      )
      .run();

    const job = await this.getJob(id);
    return job;
  }
}
