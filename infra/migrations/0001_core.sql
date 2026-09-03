PRAGMA foreign_keys = ON;

CREATE TABLE stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  callsign TEXT NOT NULL COLLATE NOCASE,
  station_callsign TEXT,
  operator_callsign TEXT,
  grid_square TEXT,
  qth TEXT,
  rig TEXT,
  antenna TEXT,
  power_w INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_stations_one_default ON stations(is_default) WHERE is_default = 1;

CREATE TABLE qsos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  station_callsign TEXT NOT NULL COLLATE NOCASE,
  call TEXT NOT NULL COLLATE NOCASE,
  qso_date TEXT NOT NULL CHECK (length(qso_date) = 8),
  time_on TEXT NOT NULL CHECK (length(time_on) = 6),
  qso_at INTEGER NOT NULL,
  band TEXT NOT NULL,
  freq_hz INTEGER,
  mode TEXT NOT NULL,
  submode TEXT,
  rst_sent TEXT,
  rst_rcvd TEXT,
  gridsquare TEXT,
  name TEXT,
  qth TEXT,
  comment TEXT,
  my_grid TEXT,
  my_rig TEXT,
  my_antenna TEXT,
  my_power_w INTEGER,
  adif_extra_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL,
  duplicate_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_ordinal >= 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','adif','api')),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(dedupe_key, duplicate_ordinal)
);
CREATE INDEX idx_qsos_time ON qsos(qso_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_qsos_call_date ON qsos(call, qso_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_qsos_station ON qsos(station_id, qso_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  total_records INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('created','running','completed','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE import_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(job_id, chunk_index)
);

CREATE TABLE card_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  base_width INTEGER NOT NULL,
  base_height INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  background_r2_key TEXT,
  background_sha256 TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE qsl_cards (
  id TEXT PRIMARY KEY,
  qso_id INTEGER NOT NULL REFERENCES qsos(id),
  template_id INTEGER NOT NULL REFERENCES card_templates(id),
  public_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft','ready','published','void')),
  qso_snapshot_json TEXT NOT NULL,
  template_snapshot_json TEXT NOT NULL,
  render_version TEXT NOT NULL,
  image_r2_key TEXT,
  content_sha256 TEXT,
  published_at INTEGER,
  voided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_cards_qso ON qsl_cards(qso_id, created_at DESC);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_events(created_at DESC);

CREATE TABLE backup_runs (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL UNIQUE,
  export_bookmark TEXT,
  object_key TEXT,
  r2_etag TEXT,
  content_sha256 TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  error_code TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  verified_at INTEGER
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
