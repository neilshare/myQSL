-- Migration 0006: resumable electronic card batch identity.
CREATE TABLE card_batches (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE card_batch_items (
  batch_id TEXT NOT NULL REFERENCES card_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  qso_id INTEGER NOT NULL REFERENCES qsos(id),
  template_version INTEGER NOT NULL,
  card_id TEXT REFERENCES qsl_cards(id),
  PRIMARY KEY(batch_id, position),
  UNIQUE(batch_id, qso_id)
);
