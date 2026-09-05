import type { AdifRecord } from "@myqsl/adif-codec";

export const CORE_ADIF_FIELDS = new Set([
  "CALL",
  "STATION_CALLSIGN",
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

  let freqMhz: string | undefined;
  if (core.freq) {
    freqMhz = String(core.freq);
  } else if (core.freq_hz) {
    freqMhz = (Number(core.freq_hz) / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
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
    freq_mhz: freqMhz,
    adif_extra: extra
  };
}

export function qsoToAdifRecord(row: Record<string, unknown>): AdifRecord {
  const fields: Record<string, string> = {};

  // 1. Core fields first in canonical order
  const CORE_ORDER = [
    "CALL",
    "STATION_CALLSIGN",
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
    "COMMENT"
  ];

  let freqMhz: string | undefined;
  let freqHz: string | undefined;
  if (row.freq_hz != null) {
    freqHz = String(row.freq_hz);
    freqMhz = (Number(row.freq_hz) / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
  } else if (row.freq_mhz != null) {
    freqMhz = String(row.freq_mhz);
    freqHz = String(Math.round(Number(row.freq_mhz) * 1_000_000));
  }

  for (const field of CORE_ORDER) {
    if (field === "FREQ" && freqMhz) {
      fields.FREQ = freqMhz;
    } else if (field === "FREQ_HZ" && freqHz) {
      fields.FREQ_HZ = freqHz;
    } else {
      const lower = field.toLowerCase();
      const val = row[lower];
      if (val !== null && val !== undefined && val !== "") {
        fields[field] = String(val);
      }
    }
  }

  // 2. Station & MY_* fields
  const MY_FIELDS = ["MY_GRID", "MY_RIG", "MY_ANTENNA", "MY_POWER_W"];
  for (const field of MY_FIELDS) {
    const lower = field.toLowerCase();
    const val = row[lower];
    if (val !== null && val !== undefined && val !== "") {
      fields[field] = String(val);
    }
  }

  // 3. Extra ADIF tags from adif_extra_json or adif_extra
  let extra: Record<string, unknown> = {};
  if (typeof row.adif_extra_json === "string") {
    try {
      extra = JSON.parse(row.adif_extra_json);
    } catch {}
  } else if (typeof row.adif_extra === "object" && row.adif_extra !== null) {
    extra = row.adif_extra as Record<string, unknown>;
  }

  for (const key of Object.keys(extra).sort()) {
    const val = extra[key];
    const upper = key.toUpperCase();
    if (val !== null && val !== undefined && !fields[upper]) {
      fields[upper] = String(val);
    }
  }

  return { fields, types: {} };
}
