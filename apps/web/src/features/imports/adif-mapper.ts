import type { AdifRecord } from "@eqsr/adif-codec";

export const CORE_ADIF_FIELDS = new Set([
  "CALL",
  "STATION_CALLSIGN",
  "OPERATOR_CALLSIGN",
  "QSO_DATE",
  "TIME_ON",
  "BAND",
  "MODE",
  "SUBMODE",
  "FREQ",
  "FREQ_HZ",
  "RST_SENT",
  "RST_RCVD",
  "GRIDSQUARE",
  "NAME",
  "QTH",
  "COMMENT",
  "MY_GRID",
  "MY_RIG",
  "MY_ANTENNA",
  "MY_POWER_W"
]);

export function recordToQso(record: AdifRecord): Record<string, unknown> {
  const fields = record.fields;
  const core: Record<string, unknown> = {};
  const extra: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    const upper = key.toUpperCase();
    if (CORE_ADIF_FIELDS.has(upper)) {
      core[key.toLowerCase()] = value;
    } else {
      extra[upper] = String(value);
    }
  }

  return {
    station_callsign: String(core.station_callsign ?? ""),
    call: String(core.call ?? ""),
    qso_date: String(core.qso_date ?? ""),
    time_on: String(core.time_on ?? ""),
    band: String(core.band ?? ""),
    mode: String(core.mode ?? ""),
    submode: core.submode ? String(core.submode) : undefined,
    rst_sent: core.rst_sent ? String(core.rst_sent) : undefined,
    rst_rcvd: core.rst_rcvd ? String(core.rst_rcvd) : undefined,
    gridsquare: core.gridsquare ? String(core.gridsquare) : undefined,
    name: core.name ? String(core.name) : undefined,
    qth: core.qth ? String(core.qth) : undefined,
    comment: core.comment ? String(core.comment) : undefined,
    my_grid: core.my_grid ? String(core.my_grid) : undefined,
    my_rig: core.my_rig ? String(core.my_rig) : undefined,
    my_antenna: core.my_antenna ? String(core.my_antenna) : undefined,
    my_power_w: core.my_power_w ? Number(core.my_power_w) : undefined,
    freq_hz: core.freq_hz
      ? Number(core.freq_hz)
      : core.freq
        ? Math.round(Number(core.freq) * 1_000_000)
        : undefined,
    adif_extra: extra
  };
}

export function qsoToAdifRecord(row: Record<string, unknown>): AdifRecord {
  const fields: Record<string, string> = {};
  const ignored = new Set([
    "id",
    "station_id",
    "version",
    "qso_at",
    "duplicate_ordinal",
    "source",
    "deleted_at",
    "created_at",
    "updated_at",
    "dedupe_key",
    "adif_extra",
    "adif_extra_json"
  ]);

  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && !ignored.has(key)) {
      fields[key.toUpperCase()] = String(value);
    }
  }

  let extra: Record<string, unknown> = {};
  if (typeof row.adif_extra_json === "string") {
    try {
      extra = JSON.parse(row.adif_extra_json);
    } catch {}
  } else if (typeof row.adif_extra === "object" && row.adif_extra !== null) {
    extra = row.adif_extra as Record<string, unknown>;
  }

  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined) {
      fields[k.toUpperCase()] = String(v);
    }
  }

  return { fields, types: {} };
}
