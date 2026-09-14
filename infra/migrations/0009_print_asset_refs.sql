-- Migration 0009: freeze referenced V2 assets with each print item.
ALTER TABLE print_batch_items ADD COLUMN asset_refs_json TEXT NOT NULL DEFAULT '[]';
