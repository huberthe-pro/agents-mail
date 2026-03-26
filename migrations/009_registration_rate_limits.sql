-- Registration rate limiting table
-- Tracks agent registration attempts per IP address to prevent abuse
CREATE TABLE IF NOT EXISTS registration_rate_limits (
  ip_address TEXT NOT NULL,
  window_type TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (ip_address, window_type, window_start)
);
