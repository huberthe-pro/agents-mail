-- Seed a test owner for local development
-- Replace the email with your own for production
INSERT OR IGNORE INTO users (id, email, display_name, created_at)
VALUES ('usr_test_owner', 'test@example.com', 'Test Owner', unixepoch());

UPDATE agents SET owner_id = 'usr_test_owner' WHERE owner_id IS NULL;
