import type { StationInput } from "@eqsr/domain";

export interface StationRow extends Omit<StationInput, "is_default"> {
  id: number;
  version: number;
  created_at: number;
  updated_at: number;
  is_default: number;
}

function mapRow(row: Record<string, unknown>): StationRow {
  return {
    id: Number(row.id),
    callsign: String(row.callsign),
    station_callsign: row.station_callsign ? String(row.station_callsign) : null,
    operator_callsign: row.operator_callsign ? String(row.operator_callsign) : null,
    grid_square: row.grid_square ? String(row.grid_square) : null,
    qth: row.qth ? String(row.qth) : null,
    rig: row.rig ? String(row.rig) : null,
    antenna: row.antenna ? String(row.antenna) : null,
    power_w: row.power_w === null || row.power_w === undefined ? null : Number(row.power_w),
    is_default: Number(row.is_default),
    version: Number(row.version),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at)
  };
}

export class StationRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: number): Promise<StationRow | null> {
    const row = await this.db.prepare("SELECT * FROM stations WHERE id = ?").bind(id).first<Record<string, unknown>>();
    return row ? mapRow(row) : null;
  }

  async findDefault(): Promise<StationRow | null> {
    const row = await this.db.prepare("SELECT * FROM stations WHERE is_default = 1 LIMIT 1").first<Record<string, unknown>>();
    return row ? mapRow(row) : null;
  }

  async list(): Promise<StationRow[]> {
    const rows = await this.db.prepare("SELECT * FROM stations ORDER BY is_default DESC, id ASC").all<Record<string, unknown>>();
    return rows.results.map(mapRow);
  }

  async create(input: StationInput & { created_at: number; updated_at: number }): Promise<StationRow> {
    const statements: D1PreparedStatement[] = [];
    if (input.is_default) statements.push(this.db.prepare("UPDATE stations SET is_default = 0, version = version + 1, updated_at = ? WHERE is_default = 1").bind(input.updated_at));
    statements.push(
      this.db.prepare(
        `INSERT INTO stations (callsign, station_callsign, operator_callsign, grid_square, qth, rig, antenna, power_w, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(input.callsign, input.station_callsign, input.operator_callsign, input.grid_square, input.qth, input.rig, input.antenna, input.power_w, input.is_default ? 1 : 0, input.created_at, input.updated_at)
    );
    await this.db.batch(statements);
    const row = await this.db.prepare("SELECT * FROM stations WHERE rowid = last_insert_rowid()").first<Record<string, unknown>>();
    if (!row) throw new Error("Station insert returned no row");
    return mapRow(row);
  }

  async updateIfVersion(id: number, version: number, input: StationInput, now: number): Promise<StationRow | null> {
    const statements: D1PreparedStatement[] = [];
    if (input.is_default) statements.push(this.db.prepare("UPDATE stations SET is_default = 0, version = version + 1, updated_at = ? WHERE is_default = 1 AND id != ?").bind(now, id));
    statements.push(
      this.db.prepare(
        `UPDATE stations SET callsign = ?, station_callsign = ?, operator_callsign = ?, grid_square = ?, qth = ?, rig = ?, antenna = ?, power_w = ?, is_default = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`
      ).bind(input.callsign, input.station_callsign, input.operator_callsign, input.grid_square, input.qth, input.rig, input.antenna, input.power_w, input.is_default ? 1 : 0, now, id, version)
    );
    const results = await this.db.batch(statements);
    const updateResult = results[results.length - 1] as D1Result;
    if (!updateResult.success || updateResult.meta.changes === 0) return null;
    return this.findById(id);
  }
}
