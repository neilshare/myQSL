import { makeDedupeKey, normalizeQso, QsoInputSchema, type QsoInput } from "@myqsl/domain";
import { StationRepository } from "../stations/repository";
import { QsoRepository, type QsoInsert, type QsoRow } from "./repository";

export class DuplicateQsoError extends Error {
  constructor(readonly duplicateOf: number) { super("QSO already exists"); }
}
export class QsoNotFoundError extends Error {}

export interface QsoCreateOptions { preserve_duplicate?: boolean; duplicate_reason?: string; source?: "manual" | "adif" | "api"; }

export class QsoService {
  constructor(private readonly repository: QsoRepository, private readonly stations: StationRepository, private readonly now: () => number = Date.now) {}

  async create(input: QsoInput, options: QsoCreateOptions = {}): Promise<{ qso: QsoRow; duplicate: boolean }> {
    const qso = normalizeQso(QsoInputSchema.parse(input));
    if (options.preserve_duplicate && !options.duplicate_reason?.trim()) throw new Error("duplicate_reason is required");
    const station = qso.station_id ? await this.stations.findById(qso.station_id) : await this.stations.findDefault();
    if (!station) throw new Error("A station is required before creating a QSO");
    const dedupeKey = await makeDedupeKey(qso);
    const duplicate = await this.repository.findDuplicate(dedupeKey);
    if (duplicate && !options.preserve_duplicate) throw new DuplicateQsoError(duplicate.id);
    const timestamp = this.now();
    const date = `${qso.qso_date.slice(0, 4)}-${qso.qso_date.slice(4, 6)}-${qso.qso_date.slice(6, 8)}`;
    const time = `${qso.time_on.slice(0, 2)}:${qso.time_on.slice(2, 4)}:${qso.time_on.slice(4, 6)}Z`;
    const qsoAt = Date.parse(`${date}T${time}`);
    if (!Number.isFinite(qsoAt)) throw new Error("Invalid QSO date/time");
    const insert: QsoInsert = { station_id: station.id, station_callsign: qso.station_callsign, call: qso.call, qso_date: qso.qso_date, time_on: qso.time_on, qso_at: qsoAt, band: qso.band, freq_hz: qso.freq_hz, mode: qso.mode, submode: qso.submode, rst_sent: qso.rst_sent, rst_rcvd: qso.rst_rcvd, gridsquare: qso.gridsquare, name: qso.name, qth: qso.qth, comment: qso.comment, adif_extra_json: JSON.stringify(qso.adif_extra), dedupe_key: dedupeKey, duplicate_ordinal: duplicate ? await this.repository.nextDuplicateOrdinal(dedupeKey) : 0, source: options.source ?? "manual", created_at: timestamp, updated_at: timestamp };
    return { qso: await this.repository.insert(insert), duplicate: Boolean(duplicate) };
  }

  list(filter: {
    call?: string;
    band?: string;
    mode?: string;
    date_from?: string;
    date_to?: string;
    includeDeleted?: boolean;
    cursor?: { qso_at: number; id: number };
    limit: number;
  }) {
    return this.repository.list(filter);
  }
  get(id: number, includeDeleted = false) { return this.repository.findById(id, includeDeleted); }
  async update(id: number, version: number, patch: Record<string, unknown>): Promise<QsoRow> { const row = await this.repository.updateIfVersion(id, version, patch, this.now()); if (!row) throw new QsoNotFoundError(); return row; }
  async trash(id: number, version: number): Promise<void> { if (!(await this.repository.trash(id, version, this.now()))) throw new QsoNotFoundError(); }
  async restore(id: number): Promise<QsoRow> { const row = await this.repository.restore(id, this.now()); if (!row) throw new QsoNotFoundError(); return row; }
}
