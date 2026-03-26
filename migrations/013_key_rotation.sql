-- Key rotation tracking: store previous key hash for KEY_ROTATED error detection
ALTER TABLE agents ADD COLUMN prev_api_key_hash TEXT;
ALTER TABLE agents ADD COLUMN key_rotated_at INTEGER;
