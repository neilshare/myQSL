-- Migration 0005: immutable print manifests.
CREATE TABLE print_batches (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('qso','card')),
  profile_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready','completed','cancelled','expired','failed')),
  renderer_version TEXT NOT NULL,
  font_manifest_version TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  result_hash TEXT,
  result_size INTEGER,
  page_count INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE print_batch_items (
  batch_id TEXT NOT NULL REFERENCES print_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  qso_id INTEGER REFERENCES qsos(id),
  card_id TEXT REFERENCES qsl_cards(id),
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  background_asset_id TEXT,
  background_sha256 TEXT,
  public_url TEXT,
  qr_omitted INTEGER NOT NULL DEFAULT 0 CHECK (qr_omitted IN (0,1)),
  PRIMARY KEY(batch_id, position)
);
CREATE INDEX idx_print_batch_items_asset ON print_batch_items(batch_id, background_asset_id);
