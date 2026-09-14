import type { QsoRow } from "./repository";

export function toQsoResponse(row: QsoRow) {
  return {
    id: row.id,
    station_id: row.station_id,
    station_callsign: row.station_callsign,
    call: row.call,
    qso_date: row.qso_date,
    time_on: row.time_on,
    qso_at: row.qso_at,
    band: row.band,
    freq_hz: row.freq_hz,
    mode: row.mode,
    submode: row.submode,
    rst_sent: row.rst_sent,
    rst_rcvd: row.rst_rcvd,
    gridsquare: row.gridsquare,
    name: row.name,
    qth: row.qth,
    comment: row.comment,
    my_rig: row.my_rig,
    my_antenna: row.my_antenna,
    my_power_w: row.my_power_w,
    other_power_w: row.other_power_w,
    adif_extra: JSON.parse(row.adif_extra_json),
    duplicate_ordinal: row.duplicate_ordinal,
    source: row.source,
    version: row.version,
    deleted_at: row.deleted_at
  };
}
