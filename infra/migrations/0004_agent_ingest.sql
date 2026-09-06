-- Migration 0004: device-scoped radio ingestion and durable source identity.
PRAGMA foreign_keys = ON;

CREATE TABLE agent_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE,
  token_expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('wsjtx','n1mm')),
  source_instance TEXT NOT NULL,
  expected_station_callsign TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(device_id, id),
  UNIQUE(device_id, source_kind, source_instance)
);
CREATE INDEX idx_agent_profiles_device ON agent_profiles(device_id, enabled);

CREATE TABLE ingest_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES agent_devices(id),
  event_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES agent_profiles(id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('wsjtx','n1mm')),
  source_instance TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('qso_logged','external_replace','external_delete')),
  payload_json TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('created','duplicate','review_required','rejected')),
  qso_id INTEGER REFERENCES qsos(id) ON DELETE SET NULL,
  duplicate_of INTEGER REFERENCES qsos(id) ON DELETE SET NULL,
  issues_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  payload_expires_at INTEGER NOT NULL,
  UNIQUE(device_id, event_id)
);
CREATE INDEX idx_ingest_events_review ON ingest_events(outcome, created_at DESC);
CREATE INDEX idx_ingest_events_source ON ingest_events(source_kind, source_instance, source_record_id);

CREATE TABLE qso_source_links (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('wsjtx','n1mm')),
  source_instance TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  qso_id INTEGER REFERENCES qsos(id) ON DELETE SET NULL,
  payload_sha256 TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  tombstoned_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(source_kind, source_instance, source_record_id)
);
CREATE INDEX idx_qso_source_links_qso ON qso_source_links(qso_id);
