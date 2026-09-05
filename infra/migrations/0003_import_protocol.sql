-- Migration 0003: Import protocol versioning and quota tracking
ALTER TABLE import_jobs ADD COLUMN chunk_size INTEGER NOT NULL DEFAULT 40;
ALTER TABLE import_jobs ADD COLUMN protocol_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE import_jobs ADD COLUMN completed_at INTEGER;
ALTER TABLE import_chunks ADD COLUMN records_count INTEGER NOT NULL DEFAULT 0;
