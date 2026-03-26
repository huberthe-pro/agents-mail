-- Create tables for Agent Mailbox

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Emails table (received)
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_read INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Sent emails tracking
CREATE TABLE IF NOT EXISTS sent_emails (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resend_id TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emails_agent_id ON emails(agent_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_sent_emails_agent_id ON sent_emails(agent_id);
