-- Track when a custom name was bound (NULL = never bound, only one binding allowed)
ALTER TABLE agents ADD COLUMN name_bound_at INTEGER;
