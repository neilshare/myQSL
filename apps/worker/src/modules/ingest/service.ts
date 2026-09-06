import { hashRadioEvent, makeDedupeKey, normalizeQso, QsoInputSchema, RadioEventSchema, type IngestReceipt, type RadioEventV1 } from "@myqsl/domain";
import type { AgentContext } from "../../platform/request-context";

type ProfileRow = { id: string; device_id: string; station_id: number; source_kind: string; source_instance: string; expected_station_callsign: string; enabled: number };
type ExistingReceipt = { id: string; event_id: string; payload_sha256: string; outcome: IngestReceipt["outcome"]; qso_id: number | null; duplicate_of: number | null; issues_json: string; created_at: number };

export class EventKeyConflictError extends Error {}
export class EventValidationError extends Error {}
export class ProfileScopeError extends Error {}

function issues(code: string, message: string) { return [{ code, message }]; }

function receipt(row: ExistingReceipt, replayed: boolean): IngestReceipt {
  return { receipt_id: row.id, event_id: row.event_id, outcome: row.outcome, qso_id: row.qso_id, duplicate_of: row.duplicate_of, issues: JSON.parse(row.issues_json) as IngestReceipt["issues"], committed_at: Number(row.created_at), replayed };
}

export class IngestService {
  constructor(private readonly db: D1Database, private readonly now: () => number = Date.now) {}

  async ingest(input: unknown, agent: AgentContext): Promise<{ receipt: IngestReceipt; status: 200 | 201 }> {
    const event = RadioEventSchema.parse(input);
    const withoutHash = { ...event } as Omit<RadioEventV1, "payload_sha256">;
    delete (withoutHash as Partial<RadioEventV1>).payload_sha256;
    const calculatedHash = await hashRadioEvent(withoutHash);
    if (calculatedHash.toLowerCase() !== event.payload_sha256.toLowerCase()) throw new EventValidationError("payload_sha256 does not match canonical event");
    const existing = await this.db.prepare("SELECT * FROM ingest_events WHERE device_id = ? AND event_id = ?").bind(agent.deviceId, event.event_id).first<ExistingReceipt>();
    if (existing) {
      if (existing.payload_sha256.toLowerCase() !== event.payload_sha256.toLowerCase()) throw new EventKeyConflictError("event_id was already used with a different payload");
      return { receipt: receipt(existing, true), status: 200 };
    }
    const profile = await this.db.prepare("SELECT * FROM agent_profiles WHERE id = ? AND device_id = ? AND enabled = 1").bind(event.profile_id, agent.deviceId).first<ProfileRow>();
    if (!profile || profile.source_kind !== event.source_kind || profile.source_instance !== event.source_instance) throw new ProfileScopeError("event profile/source is not authorized for this device");
    const createdAt = this.now();
    const receiptId = `ing_${crypto.randomUUID()}`;
    const payload = JSON.stringify(event);
    if (!event.qso || event.event_kind !== "qso_logged") {
      const issue = event.event_kind === "external_delete" ? issues("EXTERNAL_DELETE_REVIEW", "External delete is recorded for owner review") : issues("EXTERNAL_CHANGE_REVIEW", "External replacement is recorded for owner review");
      const statements = [
        this.db.prepare(`INSERT INTO ingest_events(id,device_id,event_id,payload_sha256,profile_id,source_kind,source_instance,source_record_id,event_kind,payload_json,outcome,issues_json,created_at,payload_expires_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(receiptId, agent.deviceId, event.event_id, event.payload_sha256, event.profile_id, event.source_kind, event.source_instance, event.source_record_id, event.event_kind, payload, "review_required", JSON.stringify(issue), createdAt, createdAt + 90 * 24 * 60 * 60 * 1000),
        this.db.prepare("INSERT INTO audit_events(actor,action,entity,entity_id,request_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(agent.actor, "ingest_review", "ingest_event", receiptId, receiptId, JSON.stringify({ source_kind: event.source_kind, event_kind: event.event_kind }), createdAt)
      ];
      await this.db.batch(statements);
      return { receipt: { receipt_id: receiptId, event_id: event.event_id, outcome: "review_required", qso_id: null, duplicate_of: null, issues: issue, committed_at: createdAt, replayed: false }, status: 201 };
    }
    if (event.qso.station_callsign.toUpperCase() !== profile.expected_station_callsign.toUpperCase()) throw new ProfileScopeError("station_callsign does not match the authorized profile");
    const normalized = normalizeQso(QsoInputSchema.parse({ ...event.qso, station_id: Number(profile.station_id) }));
    const dedupeKey = await makeDedupeKey(normalized);
    const duplicate = await this.db.prepare("SELECT id FROM qsos WHERE dedupe_key = ? AND duplicate_ordinal = 0 LIMIT 1").bind(dedupeKey).first<{ id: number }>();
    const source = await this.db.prepare("SELECT qso_id, payload_sha256 FROM qso_source_links WHERE source_kind = ? AND source_instance = ? AND source_record_id = ?").bind(event.source_kind, event.source_instance, event.source_record_id).first<{ qso_id: number | null; payload_sha256: string }>();
    if (source && source.payload_sha256.toLowerCase() !== event.payload_sha256.toLowerCase()) {
      const issue = issues("SOURCE_KEY_REUSED", "Source record id was reused with different content");
      const statements = [
        this.db.prepare(`INSERT INTO ingest_events(id,device_id,event_id,payload_sha256,profile_id,source_kind,source_instance,source_record_id,event_kind,payload_json,outcome,qso_id,duplicate_of,issues_json,created_at,payload_expires_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(receiptId, agent.deviceId, event.event_id, event.payload_sha256, event.profile_id, event.source_kind, event.source_instance, event.source_record_id, event.event_kind, payload, "review_required", source.qso_id, source.qso_id, JSON.stringify(issue), createdAt, createdAt + 90 * 24 * 60 * 60 * 1000),
        this.db.prepare("INSERT INTO audit_events(actor,action,entity,entity_id,request_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(agent.actor, "ingest_review", "ingest_event", receiptId, receiptId, JSON.stringify({ code: "SOURCE_KEY_REUSED" }), createdAt)
      ];
      await this.db.batch(statements);
      return { receipt: { receipt_id: receiptId, event_id: event.event_id, outcome: "review_required", qso_id: source.qso_id, duplicate_of: source.qso_id, issues: issue, committed_at: createdAt, replayed: false }, status: 201 };
    }
    const outcome: IngestReceipt["outcome"] = duplicate || source ? "duplicate" : "created";
    const qsoIdSql = `(SELECT id FROM qsos WHERE dedupe_key = ? AND duplicate_ordinal = 0 LIMIT 1)`;
    const qsoIdParams = [dedupeKey];
    const statements: D1PreparedStatement[] = [];
    if (!duplicate && !source) {
      const date = `${normalized.qso_date.slice(0, 4)}-${normalized.qso_date.slice(4, 6)}-${normalized.qso_date.slice(6, 8)}`;
      const qsoAt = Date.parse(`${date}T${normalized.time_on.slice(0, 2)}:${normalized.time_on.slice(2, 4)}:${normalized.time_on.slice(4, 6)}Z`);
      statements.push(this.db.prepare(`INSERT INTO qsos(station_id,station_callsign,call,qso_date,time_on,qso_at,band,freq_hz,mode,submode,rst_sent,rst_rcvd,gridsquare,name,qth,comment,adif_extra_json,dedupe_key,duplicate_ordinal,source,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(profile.station_id, normalized.station_callsign, normalized.call, normalized.qso_date, normalized.time_on, qsoAt, normalized.band, normalized.freq_hz, normalized.mode, normalized.submode, normalized.rst_sent, normalized.rst_rcvd, normalized.gridsquare, normalized.name, normalized.qth, normalized.comment, JSON.stringify(normalized.adif_extra), dedupeKey, 0, "api", createdAt, createdAt));
    }
    statements.push(this.db.prepare(`INSERT INTO qso_source_links(source_kind,source_instance,source_record_id,qso_id,payload_sha256,last_event_id,created_at)
      VALUES(?,?,?,${qsoIdSql},?,?,?) ON CONFLICT(source_kind,source_instance,source_record_id) DO UPDATE SET qso_id=excluded.qso_id,payload_sha256=excluded.payload_sha256,last_event_id=excluded.last_event_id`).bind(event.source_kind, event.source_instance, event.source_record_id, ...qsoIdParams, event.payload_sha256, event.event_id, createdAt));
    const duplicateSql = outcome === "duplicate" ? qsoIdSql : "NULL";
    statements.push(this.db.prepare(`INSERT INTO ingest_events(id,device_id,event_id,payload_sha256,profile_id,source_kind,source_instance,source_record_id,event_kind,payload_json,outcome,qso_id,duplicate_of,issues_json,created_at,payload_expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,${qsoIdSql},${duplicateSql},?,?,?)`).bind(receiptId, agent.deviceId, event.event_id, event.payload_sha256, event.profile_id, event.source_kind, event.source_instance, event.source_record_id, event.event_kind, payload, outcome, ...qsoIdParams, ...(outcome === "duplicate" ? qsoIdParams : []), "[]", createdAt, createdAt + 90 * 24 * 60 * 60 * 1000));
    statements.push(this.db.prepare(`INSERT INTO audit_events(actor,action,entity,entity_id,request_id,detail_json,created_at) VALUES(?,?,?,${qsoIdSql},?,?,?)`).bind(agent.actor, outcome === "created" ? "ingest_create_qso" : "ingest_duplicate", "qso", ...qsoIdParams, receiptId, JSON.stringify({ source_kind: event.source_kind, source_record_id: event.source_record_id }), createdAt));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const winner = await this.db.prepare("SELECT id FROM qsos WHERE dedupe_key = ? AND duplicate_ordinal = 0 LIMIT 1").bind(dedupeKey).first<{ id: number }>();
      if (winner) {
        const linked = await this.db.prepare("SELECT * FROM qso_source_links WHERE source_kind = ? AND source_instance = ? AND source_record_id = ?").bind(event.source_kind, event.source_instance, event.source_record_id).first<{ qso_id: number; payload_sha256: string }>();
        if (linked && linked.payload_sha256 === event.payload_sha256) {
          const retryIssue = issues("CONCURRENT_DUPLICATE", "Another event committed the same QSO");
          await this.db.batch([
            this.db.prepare(`INSERT INTO ingest_events(id,device_id,event_id,payload_sha256,profile_id,source_kind,source_instance,source_record_id,event_kind,payload_json,outcome,qso_id,duplicate_of,issues_json,created_at,payload_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(receiptId, agent.deviceId, event.event_id, event.payload_sha256, event.profile_id, event.source_kind, event.source_instance, event.source_record_id, event.event_kind, payload, "duplicate", winner.id, winner.id, JSON.stringify(retryIssue), createdAt, createdAt + 90 * 24 * 60 * 60 * 1000)
          ]);
          return { receipt: { receipt_id: receiptId, event_id: event.event_id, outcome: "duplicate", qso_id: winner.id, duplicate_of: winner.id, issues: retryIssue, committed_at: createdAt, replayed: false }, status: 200 };
        }
      }
      throw error;
    }
    const committed = await this.db.prepare("SELECT id FROM qsos WHERE dedupe_key = ? AND duplicate_ordinal = 0 LIMIT 1").bind(dedupeKey).first<{ id: number }>();
    const qsoId = committed?.id ?? null;
    return { receipt: { receipt_id: receiptId, event_id: event.event_id, outcome, qso_id: qsoId, duplicate_of: outcome === "duplicate" ? qsoId : null, issues: [], committed_at: createdAt, replayed: false }, status: 201 };
  }
}
