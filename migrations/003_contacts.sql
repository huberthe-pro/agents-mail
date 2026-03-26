-- Contacts table for Agent address book
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'agent', -- 'agent' or 'human'
  tags TEXT, -- JSON array
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(agent_id, email)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_contacts_agent_id ON contacts(agent_id);
