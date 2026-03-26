-- ACL table for access control
CREATE TABLE IF NOT EXISTS acl (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'whitelist', -- 'whitelist', 'owner', 'blacklist'
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(agent_id, email)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_acl_agent_id ON acl(agent_id);
CREATE INDEX IF NOT EXISTS idx_acl_email ON acl(email);
