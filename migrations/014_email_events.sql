CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  email_id TEXT,
  direction TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_email_events_agent_id ON email_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
