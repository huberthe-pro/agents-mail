-- Add actor_type to distinguish admin vs agent vs user vs system audit entries
ALTER TABLE admin_audit_logs ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'admin';
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);
