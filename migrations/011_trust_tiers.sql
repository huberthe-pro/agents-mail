-- Add trust tier column to agents
-- Tier 0: anonymous (random address, receive-only)
-- Tier 1: verified (3+ mutual contacts or has owner, can send)
-- Tier 2: established (tier 1 + activity history)
-- Tier 3: paid (future, reserved)
ALTER TABLE agents ADD COLUMN trust_tier INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agents_trust_tier ON agents(trust_tier);
