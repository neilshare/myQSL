-- Migration 0008: immutable template assets, references and idempotent template creation.
PRAGMA foreign_keys = ON;

CREATE TABLE template_assets (
  id TEXT PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg')),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  created_at INTEGER NOT NULL,
  UNIQUE(template_id, sha256)
);
CREATE INDEX idx_template_assets_template ON template_assets(template_id, created_at);

CREATE TABLE template_asset_refs (
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('template', 'card', 'print')),
  owner_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES template_assets(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_kind, owner_id, asset_id)
);
CREATE INDEX idx_template_asset_refs_asset ON template_asset_refs(asset_id);

CREATE TABLE template_create_requests (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  template_id INTEGER REFERENCES card_templates(id),
  created_at INTEGER NOT NULL
);
