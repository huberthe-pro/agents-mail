-- Add direction column to contacts for bidirectional contact graph
-- Values: 'manual' (default), 'outbound', 'inbound', 'mutual'
ALTER TABLE contacts ADD COLUMN direction TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_contacts_direction ON contacts(agent_id, direction);
