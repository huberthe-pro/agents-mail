-- Global registration rate limits and fingerprint tracking for anti-abuse
CREATE TABLE IF NOT EXISTS global_rate_limits (
  window_type TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (window_type, window_start)
);

CREATE TABLE IF NOT EXISTS registration_fingerprints (
  fingerprint_hash TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  registration_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reg_fp_last_seen ON registration_fingerprints(last_seen_at);
