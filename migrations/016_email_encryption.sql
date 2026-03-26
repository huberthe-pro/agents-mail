-- Email content encryption at rest (AES-256-GCM)
ALTER TABLE emails ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN encryption_iv TEXT;
ALTER TABLE emails ADD COLUMN encryption_version INTEGER DEFAULT 1;

ALTER TABLE sent_emails ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sent_emails ADD COLUMN encryption_iv TEXT;
ALTER TABLE sent_emails ADD COLUMN encryption_version INTEGER DEFAULT 1;
