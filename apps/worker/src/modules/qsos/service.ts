import {
  makeDedupeKey,
  normalizeQso,
  normalizeQsoPatch,
  QsoInputSchema,
  type QsoInput,
  type QsoPatchInput
} from "@myqsl/domain";
import type { AuditEventInput } from "../../platform/audit";
import { StationRepository } from "../stations/repository";
import { QsoRepository, type QsoInsert, type QsoRow } from "./repository";

export class DuplicateQsoError extends Error {
  constructor(readonly duplicateOf: number) { super("QSO already exists"); }
}
export class QsoNotFoundError extends Error {}
export class PreconditionError extends Error {
  constructor(message = "Precondition failed") { super(message); }
}

export interface QsoCreateOptions {
  preserve_duplicate?: boolean;
  duplicate_reason?: string;
  source?: "manual" | "adif" | "api";
}

export interface QsoAuditContext {
  actor: string;
  requestId: string;
  ipHash?: string;
}

export class QsoService {
  constructor(
    private readonly repository: QsoRepository,
    private readonly stations: StationRepository,
    private readonly now: () => number = Date.now
  ) {}

  async create(
    input: QsoInput,
    options: QsoCreateOptions = {},
    auditContext?: QsoAuditContext
  ): Promise<{ qso: QsoRow; duplicate: boolean }> {
    const qso = normalizeQso(QsoInputSchema.parse(input));
    if (options.preserve_duplicate && !options.duplicate_reason?.trim()) {
      throw new Error("duplicate_reason is required");
    }
    const station = qso.station_id ? await this.stations.findById(qso.station_id) : await this.stations.findDefault();
    if (!station) throw new Error("A station is required before creating a QSO");
    if (qso.station_callsign && qso.station_callsign.toUpperCase() !== station.callsign.toUpperCase()) {
      throw new Error(`station_callsign (${qso.station_callsign}) does not match station (${station.callsign})`);
    }
    const stationCallsign = station.callsign.toUpperCase();
    const dedupeKey = await makeDedupeKey({ ...qso, station_callsign: stationCallsign });
    const duplicate = await this.repository.findDuplicate(dedupeKey);
    if (duplicate && !options.preserve_duplicate) throw new DuplicateQsoError(duplicate.id);
    const timestamp = this.now();
    const date = `${qso.qso_date.slice(0, 4)}-${qso.qso_date.slice(4, 6)}-${qso.qso_date.slice(6, 8)}`;
    const time = `${qso.time_on.slice(0, 2)}:${qso.time_on.slice(2, 4)}:${qso.time_on.slice(4, 6)}Z`;
    const qsoAt = Date.parse(`${date}T${time}`);
    if (!Number.isFinite(qsoAt)) throw new Error("Invalid QSO date/time");

    const insert: QsoInsert = {
      station_id: station.id,
      station_callsign: stationCallsign,
      call: qso.call,
      qso_date: qso.qso_date,
      time_on: qso.time_on,
      qso_at: qsoAt,
      band: qso.band,
      freq_hz: qso.freq_hz,
      mode: qso.mode,
      submode: qso.submode,
      rst_sent: qso.rst_sent,
      rst_rcvd: qso.rst_rcvd,
      gridsquare: qso.gridsquare,
      name: qso.name,
      qth: qso.qth,
      comment: qso.comment,
      adif_extra_json: JSON.stringify(qso.adif_extra),
      dedupe_key: dedupeKey,
      duplicate_ordinal: duplicate ? await this.repository.nextDuplicateOrdinal(dedupeKey) : 0,
      source: options.source ?? "manual",
      created_at: timestamp,
      updated_at: timestamp
    };

    const auditEvent: AuditEventInput | undefined = auditContext
      ? {
          actor: auditContext.actor,
          action: "create_qso",
          entity: "qso",
          requestId: auditContext.requestId,
          ipHash: auditContext.ipHash,
          detail: { call: qso.call, band: qso.band, mode: qso.mode },
          createdAt: timestamp
        }
      : undefined;

    return {
      qso: await this.repository.insert(insert, auditEvent),
      duplicate: Boolean(duplicate)
    };
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

  get(id: number, includeDeleted = false) {
    return this.repository.findById(id, includeDeleted);
  }

  async update(
    id: number,
    version: number,
    patchInput: QsoPatchInput,
    auditContext?: QsoAuditContext
  ): Promise<QsoRow> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new QsoNotFoundError();
    if (existing.version !== version) throw new PreconditionError("Stale version");

    const patch = normalizeQsoPatch(patchInput);
    if (Object.keys(patch).length === 0) {
      return existing;
    }

    let newDedupeKey: string | undefined;
    if (patch.band !== undefined || patch.mode !== undefined || patch.submode !== undefined) {
      const mergedForDedupe = {
        station_callsign: existing.station_callsign,
        call: existing.call,
        qso_date: existing.qso_date,
        time_on: existing.time_on,
        band: patch.band ?? existing.band,
        mode: patch.mode ?? existing.mode,
        submode: patch.submode !== undefined ? patch.submode : existing.submode,
        freq_mhz: patch.freq_mhz !== undefined ? patch.freq_mhz : (existing.freq_hz ? (existing.freq_hz / 1_000_000).toString() : null),
        adif_extra: patch.adif_extra ?? (existing.adif_extra_json ? JSON.parse(existing.adif_extra_json) : {})
      };
      newDedupeKey = await makeDedupeKey(mergedForDedupe);
      if (newDedupeKey !== existing.dedupe_key) {
        const duplicate = await this.repository.findDuplicate(newDedupeKey);
        if (duplicate && duplicate.id !== id) {
          throw new DuplicateQsoError(duplicate.id);
        }
      }
    }

    const dbPatch: Record<string, unknown> = {};
    if (patch.band !== undefined) dbPatch.band = patch.band;
    if (patch.freq_hz !== undefined) dbPatch.freq_hz = patch.freq_hz;
    if (patch.mode !== undefined) dbPatch.mode = patch.mode;
    if (patch.submode !== undefined) dbPatch.submode = patch.submode;
    if (patch.rst_sent !== undefined) dbPatch.rst_sent = patch.rst_sent;
    if (patch.rst_rcvd !== undefined) dbPatch.rst_rcvd = patch.rst_rcvd;
    if (patch.gridsquare !== undefined) dbPatch.gridsquare = patch.gridsquare;
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.qth !== undefined) dbPatch.qth = patch.qth;
    if (patch.comment !== undefined) dbPatch.comment = patch.comment;
    if (patch.adif_extra !== undefined) dbPatch.adif_extra_json = JSON.stringify(patch.adif_extra);
    if (newDedupeKey && newDedupeKey !== existing.dedupe_key) dbPatch.dedupe_key = newDedupeKey;

    const auditEvent: AuditEventInput | undefined = auditContext
      ? {
          actor: auditContext.actor,
          action: "update_qso",
          entity: "qso",
          entityId: String(id),
          requestId: auditContext.requestId,
          ipHash: auditContext.ipHash,
          detail: { ...dbPatch },
          createdAt: this.now()
        }
      : undefined;

    try {
      const row = await this.repository.updateIfVersion(id, version, dbPatch, this.now(), auditEvent);
      if (!row) throw new PreconditionError("Stale version");
      return row;
    } catch (err: any) {
      if (err instanceof PreconditionError || err instanceof DuplicateQsoError) throw err;
      if (err?.message?.includes("UNIQUE") || err?.message?.includes("constraint")) {
        throw new DuplicateQsoError(0);
      }
      throw err;
    }
  }

  async trash(id: number, version: number, auditContext?: QsoAuditContext): Promise<void> {
    const auditEvent: AuditEventInput | undefined = auditContext
      ? {
          actor: auditContext.actor,
          action: "trash_qso",
          entity: "qso",
          entityId: String(id),
          requestId: auditContext.requestId,
          ipHash: auditContext.ipHash,
          createdAt: this.now()
        }
      : undefined;

    const ok = await this.repository.trash(id, version, this.now(), auditEvent);
    if (!ok) {
      const existing = await this.repository.findById(id, true);
      if (!existing || existing.deleted_at !== null) throw new QsoNotFoundError();
      throw new PreconditionError("Stale version");
    }
  }

  async restore(id: number, auditContext?: QsoAuditContext): Promise<QsoRow> {
    const auditEvent: AuditEventInput | undefined = auditContext
      ? {
          actor: auditContext.actor,
          action: "restore_qso",
          entity: "qso",
          entityId: String(id),
          requestId: auditContext.requestId,
          ipHash: auditContext.ipHash,
          createdAt: this.now()
        }
      : undefined;

    const row = await this.repository.restore(id, this.now(), auditEvent);
    if (!row) throw new QsoNotFoundError();
    return row;
  }
}
