-- Track last activity for Tier 0 auto-recycle
ALTER TABLE agents ADD COLUMN last_activity_at INTEGER;

-- Backfill: set to created_at for existing agents
UPDATE agents SET last_activity_at = created_at WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_tier_activity ON agents(trust_tier, last_activity_at);
