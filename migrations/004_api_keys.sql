-- Add API key hash column to agents table
ALTER TABLE agents ADD COLUMN api_key_hash TEXT;
