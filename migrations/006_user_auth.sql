-- Human users (for Dashboard login)
-- AI Agents don't need this - they use API Key via CLI/API
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  session_invalidated_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Magic Link tokens (for human login only)
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_hash ON magic_link_tokens(token_hash);

-- Agent-Owner claims (linking Agent to its human owner)
CREATE TABLE IF NOT EXISTS agent_owner_claims (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_owner_claims_agent_id ON agent_owner_claims(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_owner_claims_code ON agent_owner_claims(verification_code);

-- Link agents to their human owner
ALTER TABLE agents ADD COLUMN owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON agents(owner_id);
