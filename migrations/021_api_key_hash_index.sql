-- v0.4: resolveAgentFromAuth needs to look up agent by api_key_hash alone
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
