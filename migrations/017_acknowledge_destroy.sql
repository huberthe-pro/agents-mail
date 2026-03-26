-- Email lifecycle: pending → delivered → acknowledged → destroyed
ALTER TABLE emails ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE emails ADD COLUMN status_updated_at INTEGER;
ALTER TABLE emails ADD COLUMN receipt_id TEXT;
ALTER TABLE emails ADD COLUMN receipt_signature TEXT;
ALTER TABLE emails ADD COLUMN content_destroyed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_status_updated ON emails(status, status_updated_at);

ALTER TABLE sent_emails ADD COLUMN content_destroyed_at INTEGER;
