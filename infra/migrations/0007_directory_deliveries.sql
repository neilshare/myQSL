-- Migration 0007: QRZ directory cache and email delivery outbox.
CREATE TABLE directory_contacts (
  id TEXT PRIMARY KEY,
  requested_call TEXT NOT NULL UNIQUE,
  resolved_call TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready','no_email','subscription_required','unavailable')),
  email_ciphertext TEXT,
  email_key_version TEXT,
  email_nonce TEXT,
  email_hmac TEXT,
  masked_email TEXT,
  lookup_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_directory_contacts_expiry ON directory_contacts(expires_at);
CREATE TABLE delivery_batches (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preparing','ready','failed','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  request_items_json TEXT NOT NULL,
  language TEXT NOT NULL,
  attachment_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  expires_at INTEGER,
  error_code TEXT
);
CREATE TABLE delivery_batch_items (
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  card_id TEXT NOT NULL REFERENCES qsl_cards(id),
  preparation_status TEXT NOT NULL CHECK (preparation_status IN ('pending','ready','blocked')),
  directory_contact_id TEXT REFERENCES directory_contacts(id),
  delivery_id TEXT,
  existing_delivery_id TEXT,
  alias_confirmed_at INTEGER,
  confirmed_resolved_call TEXT,
  error_code TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(batch_id, position)
);
CREATE TABLE card_deliveries (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id),
  card_id TEXT NOT NULL REFERENCES qsl_cards(id),
  recipient_ciphertext TEXT,
  recipient_key_version TEXT,
  recipient_nonce TEXT,
  recipient_hmac TEXT NOT NULL,
  masked_email TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  payload_json_encrypted TEXT,
  dispatch_revision INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','sending','submitted','delivered','bounced','unknown','cancelled','retry_wait')),
  send_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (send_confirmed IN (0,1)),
  provider_id TEXT UNIQUE,
  provider_key TEXT NOT NULL UNIQUE,
  next_attempt_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  quota_day_utc TEXT NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  first_send_at INTEGER,
  workflow_generation INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(card_id, recipient_hmac, content_sha256, dispatch_revision)
);
CREATE INDEX idx_card_deliveries_due ON card_deliveries(status, next_attempt_at);
CREATE TABLE delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL REFERENCES card_deliveries(id),
  attempt_no INTEGER NOT NULL,
  lease_token TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_code TEXT,
  provider_id TEXT,
  UNIQUE(delivery_id, attempt_no)
);
CREATE TABLE delivery_webhook_events (
  provider_event_id TEXT PRIMARY KEY,
  provider_id TEXT,
  type TEXT NOT NULL,
  occurred_at INTEGER,
  received_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE TABLE email_suppressions (
  recipient_hmac TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  source_event_id TEXT,
  created_at INTEGER NOT NULL,
  released_at INTEGER
);
CREATE TABLE dispatch_daily_quotas (
  day_utc TEXT PRIMARY KEY,
  reserved_count INTEGER NOT NULL DEFAULT 0,
  attempted_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE dispatch_throttle (id INTEGER PRIMARY KEY CHECK (id = 1), next_send_at INTEGER NOT NULL);
INSERT INTO dispatch_throttle(id, next_send_at) VALUES (1, 0);
