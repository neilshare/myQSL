import { DatabaseSync } from "node:sqlite";
import type { IngestReceipt, RadioEventV1 } from "@myqsl/domain";

export type OutboxStatus = "pending" | "inflight" | "retry_wait" | "acked" | "quarantined";
export type OutboxItem = { event_id: string; profile_id: string; payload: RadioEventV1; status: OutboxStatus; attempt_count: number; next_retry_at: number; last_error: string | null; created_at: number };

export class OutboxCapacityError extends Error {}

export class Outbox {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly limits = { maxEvents: 50_000, maxBytes: 256 * 1024 * 1024 }) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
    this.db.exec(`CREATE TABLE IF NOT EXISTS agent_outbox (event_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, payload_json TEXT NOT NULL, payload_bytes INTEGER NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER NOT NULL, last_error TEXT, receipt_json TEXT, created_at INTEGER NOT NULL, acked_at INTEGER)`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_agent_outbox_due ON agent_outbox(status, next_retry_at, created_at)");
    this.db.exec("UPDATE agent_outbox SET status='pending', last_error='recovered after agent restart' WHERE status='inflight'");
  }

  enqueue(event: RadioEventV1, now = Date.now()): { inserted: boolean } {
    const payload = JSON.stringify(event);
    const bytes = Buffer.byteLength(payload, "utf8");
    const existing = this.db.prepare("SELECT status FROM agent_outbox WHERE event_id = ?").get(event.event_id) as { status?: string } | undefined;
    if (existing) return { inserted: false };
    const totals = this.db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(payload_bytes), 0) AS bytes FROM agent_outbox WHERE status <> 'acked'").get() as { count: number; bytes: number };
    if (Number(totals.count) >= this.limits.maxEvents || Number(totals.bytes) + bytes > this.limits.maxBytes) throw new OutboxCapacityError("Agent outbox capacity reached; unacknowledged events were retained");
    this.db.prepare("INSERT INTO agent_outbox(event_id,profile_id,payload_json,payload_bytes,status,next_retry_at,created_at) VALUES(?,?,?,?,?,?,?)").run(event.event_id, event.profile_id, payload, bytes, "pending", now, now);
    return { inserted: true };
  }

  claimDue(now = Date.now(), limit = 2): OutboxItem[] {
    const rows = this.db.prepare("SELECT * FROM agent_outbox WHERE status IN ('pending','retry_wait') AND next_retry_at <= ? ORDER BY created_at, event_id LIMIT ?").all(now, limit) as Array<Record<string, unknown>>;
    const update = this.db.prepare("UPDATE agent_outbox SET status='inflight', attempt_count=attempt_count+1 WHERE event_id=? AND status IN ('pending','retry_wait')");
    const result: OutboxItem[] = [];
    for (const row of rows) {
      const changed = update.run(String(row.event_id));
      if (Number(changed.changes) !== 1) continue;
      result.push(this.map(row, "inflight", Number(row.attempt_count) + 1));
    }
    return result;
  }

  ack(eventId: string, receipt: IngestReceipt, now = Date.now()): void {
    this.db.prepare("UPDATE agent_outbox SET status='acked', receipt_json=?, acked_at=?, last_error=NULL WHERE event_id=? AND status='inflight'").run(JSON.stringify(receipt), now, eventId);
  }

  retry(eventId: string, nextRetryAt: number, error: string): void {
    this.db.prepare("UPDATE agent_outbox SET status='retry_wait', next_retry_at=?, last_error=? WHERE event_id=? AND status='inflight'").run(nextRetryAt, error.slice(0, 500), eventId);
  }

  quarantine(eventId: string, issue: string): void {
    this.db.prepare("UPDATE agent_outbox SET status='quarantined', last_error=? WHERE event_id=? AND status IN ('pending','inflight','retry_wait')").run(issue.slice(0, 500), eventId);
  }

  stats(now = Date.now()): { pending: number; inflight: number; retry_wait: number; acked: number; quarantined: number; oldest_unacked_at: number | null; total_bytes: number } {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS count FROM agent_outbox GROUP BY status").all() as Array<{ status: OutboxStatus; count: number }>;
    const values = { pending: 0, inflight: 0, retry_wait: 0, acked: 0, quarantined: 0, oldest_unacked_at: null as number | null, total_bytes: 0 };
    for (const row of rows) if (row.status in values) values[row.status] = Number(row.count) as never;
    const old = this.db.prepare("SELECT MIN(created_at) AS oldest, COALESCE(SUM(payload_bytes),0) AS bytes FROM agent_outbox WHERE status <> 'acked'").get() as { oldest: number | null; bytes: number };
    values.oldest_unacked_at = old.oldest === null ? null : Number(old.oldest);
    values.total_bytes = Number(old.bytes);
    void now;
    return values;
  }

  close(): void { this.db.close(); }

  private map(row: Record<string, unknown>, status: OutboxStatus, attemptCount: number): OutboxItem {
    return { event_id: String(row.event_id), profile_id: String(row.profile_id), payload: JSON.parse(String(row.payload_json)) as RadioEventV1, status, attempt_count: attemptCount, next_retry_at: Number(row.next_retry_at), last_error: row.last_error == null ? null : String(row.last_error), created_at: Number(row.created_at) };
  }
}
