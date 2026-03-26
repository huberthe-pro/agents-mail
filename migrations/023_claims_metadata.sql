-- Add metadata_json to agent_owner_claims for storing upgrade parameters (e.g. requested name)
ALTER TABLE agent_owner_claims ADD COLUMN metadata_json TEXT;
