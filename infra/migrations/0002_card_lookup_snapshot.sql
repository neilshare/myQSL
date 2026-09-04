-- Migration 0002: Add snapshot lookup columns to qsl_cards for zero-join tamper-resistant verification
ALTER TABLE qsl_cards ADD COLUMN lookup_call TEXT;
ALTER TABLE qsl_cards ADD COLUMN lookup_qso_date TEXT;
CREATE INDEX idx_cards_lookup_snapshot ON qsl_cards(lookup_call, lookup_qso_date) WHERE status = 'published';
