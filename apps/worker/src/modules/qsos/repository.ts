export interface QsoRow {
  id: number;
  station_id: number;
  station_callsign: string;
  call: string;
  qso_date: string;
  time_on: string;
  qso_at: number;
  band: string;
  freq_hz: number | null;
  mode: string;
  submode: string | null;
  rst_sent: string | null;
  rst_rcvd: string | null;
  gridsquare: string | null;
  name: string | null;
  qth: string | null;
  comment: string | null;
  my_grid: string | null;
  my_rig: string | null;
  my_antenna: string | null;
  my_power_w: number | null;
  adif_extra_json: string;
  dedupe_key: string;
  duplicate_ordinal: number;
  source: string;
  version: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface QsoInsert {
  station_id: number;
  station_callsign: string;
  call: string;
  qso_date: string;
  time_on: string;
  qso_at: number;
  band: string;
  freq_hz: number | null;
  mode: string;
  submode: string | null;
  rst_sent: string | null;
  rst_rcvd: string | null;
  gridsquare: string | null;
  name: string | null;
  qth: string | null;
  comment: string | null;
  adif_extra_json: string;
  dedupe_key: string;
  duplicate_ordinal: number;
  source: "manual" | "adif" | "api";
  created_at: number;
  updated_at: number;
}

function mapRow(row: Record<string, unknown>): QsoRow {
  const nullable = (key: string) => (row[key] === null || row[key] === undefined ? null : String(row[key]));
  return {
    id: Number(row.id), station_id: Number(row.station_id), station_callsign: String(row.station_callsign), call: String(row.call), qso_date: String(row.qso_date), time_on: String(row.time_on), qso_at: Number(row.qso_at), band: String(row.band), freq_hz: row.freq_hz == null ? null : Number(row.freq_hz), mode: String(row.mode), submode: nullable("submode"), rst_sent: nullable("rst_sent"), rst_rcvd: nullable("rst_rcvd"), gridsquare: nullable("gridsquare"), name: nullable("name"), qth: nullable("qth"), comment: nullable("comment"), my_grid: nullable("my_grid"), my_rig: nullable("my_rig"), my_antenna: nullable("my_antenna"), my_power_w: row.my_power_w == null ? null : Number(row.my_power_w), adif_extra_json: String(row.adif_extra_json), dedupe_key: String(row.dedupe_key), duplicate_ordinal: Number(row.duplicate_ordinal), source: String(row.source), version: Number(row.version), deleted_at: row.deleted_at == null ? null : Number(row.deleted_at), created_at: Number(row.created_at), updated_at: Number(row.updated_at)
  };
}

export class QsoRepository {
  constructor(private readonly db: D1Database) {}

  async findDuplicate(dedupeKey: string): Promise<{ id: number; duplicate_ordinal: number } | null> {
    const row = await this.db.prepare("SELECT id, duplicate_ordinal FROM qsos WHERE dedupe_key = ? AND duplicate_ordinal = 0 LIMIT 1").bind(dedupeKey).first<{ id: number; duplicate_ordinal: number }>();
    return row ?? null;
  }

  async nextDuplicateOrdinal(dedupeKey: string): Promise<number> {
    const row = await this.db.prepare("SELECT COALESCE(MAX(duplicate_ordinal), -1) + 1 AS next_ordinal FROM qsos WHERE dedupe_key = ?").bind(dedupeKey).first<{ next_ordinal: number }>();
    return Number(row?.next_ordinal ?? 0);
  }

  async insert(input: QsoInsert): Promise<QsoRow> {
    await this.db.prepare(
      `INSERT INTO qsos (station_id, station_callsign, call, qso_date, time_on, qso_at, band, freq_hz, mode, submode, rst_sent, rst_rcvd, gridsquare, name, qth, comment, adif_extra_json, dedupe_key, duplicate_ordinal, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(input.station_id, input.station_callsign, input.call, input.qso_date, input.time_on, input.qso_at, input.band, input.freq_hz, input.mode, input.submode, input.rst_sent, input.rst_rcvd, input.gridsquare, input.name, input.qth, input.comment, input.adif_extra_json, input.dedupe_key, input.duplicate_ordinal, input.source, input.created_at, input.updated_at).run();
    const row = await this.db.prepare("SELECT * FROM qsos WHERE rowid = last_insert_rowid()").first<Record<string, unknown>>();
    if (!row) throw new Error("QSO insert returned no row");
    return mapRow(row);
  }

  async findById(id: number, includeDeleted = false): Promise<QsoRow | null> {
    const row = await this.db.prepare(`SELECT * FROM qsos WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}`).bind(id).first<Record<string, unknown>>();
    return row ? mapRow(row) : null;
  }

  async list(query: {
    call?: string;
    band?: string;
    mode?: string;
    date_from?: string;
    date_to?: string;
    includeDeleted?: boolean;
    cursor?: { qso_at: number; id: number };
    limit: number;
  }): Promise<QsoRow[]> {
    const clauses = [query.includeDeleted ? "1=1" : "deleted_at IS NULL"];
    const params: Array<string | number> = [];
    if (query.call) {
      clauses.push("call = ?");
      params.push(query.call);
    }
    if (query.band) {
      clauses.push("band = ?");
      params.push(query.band);
    }
    if (query.mode) {
      clauses.push("mode = ?");
      params.push(query.mode);
    }
    if (query.date_from) {
      clauses.push("qso_date >= ?");
      params.push(query.date_from);
    }
    if (query.date_to) {
      clauses.push("qso_date <= ?");
      params.push(query.date_to);
    }
    if (query.cursor) {
      clauses.push("(qso_at < ? OR (qso_at = ? AND id < ?))");
      params.push(query.cursor.qso_at, query.cursor.qso_at, query.cursor.id);
    }
    const result = await this.db
      .prepare(`SELECT * FROM qsos WHERE ${clauses.join(" AND ")} ORDER BY qso_at DESC, id DESC LIMIT ?`)
      .bind(...params, query.limit)
      .all<Record<string, unknown>>();
    return result.results.map(mapRow);
  }

  async updateIfVersion(id: number, version: number, patch: Record<string, unknown>, now: number): Promise<QsoRow | null> {
    const allowed = ["comment", "name", "qth", "rst_sent", "rst_rcvd", "gridsquare", "freq_hz", "band", "mode", "submode"];
    const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
    if (!entries.length) return this.findById(id);
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value == null ? null : String(value));
    const result = await this.db.prepare(`UPDATE qsos SET ${assignments}, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND deleted_at IS NULL`).bind(...values, now, id, version).run();
    if (!result.meta.changes) return null;
    return this.findById(id);
  }

  async trash(id: number, version: number, now: number): Promise<boolean> {
    const result = await this.db.prepare("UPDATE qsos SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND deleted_at IS NULL").bind(now, now, id, version).run();
    return Boolean(result.meta.changes);
  }

  async restore(id: number, now: number): Promise<QsoRow | null> {
    const result = await this.db.prepare("UPDATE qsos SET deleted_at = NULL, version = version + 1, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL").bind(now, id).run();
    if (!result.meta.changes) return null;
    return this.findById(id);
  }
}
