-- v0.4 email lifecycle: pending→unread, delivered→read, acknowledged→deleted
UPDATE emails SET status = 'unread' WHERE status = 'pending';
UPDATE emails SET status = 'read' WHERE status = 'delivered';
UPDATE emails SET status = 'deleted' WHERE status = 'acknowledged';
