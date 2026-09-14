ALTER TABLE qsos ADD COLUMN other_power_w INTEGER;

CREATE INDEX IF NOT EXISTS idx_qsos_other_power ON qsos(other_power_w) WHERE deleted_at IS NULL;
