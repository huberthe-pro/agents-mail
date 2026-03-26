import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSendMagicLink, handleVerifyMagicLink, handleLogout, handleGetMe } from './handlers/auth';
import { handleClaimAgent, handleConfirmClaim, handleRemoveOwner } from './handlers/owner';
import { handleCreateAgent, handleListAgents } from './handlers/agents';
import { signJwt, verifyJwt, getUserFromRequest } from './middleware/jwt';
import { hashApiKey, generateApiKey, authenticateAgent } from './middleware/auth';

// --- Mock helpers ---

function createMockDB(queryResponses: Record<string, any> = {}) {
  const defaultResponse = { results: [], success: true };
  return {
    prepare: vi.fn((sql: string) => {
      const response = queryResponses[sql] || defaultResponse;
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        all: vi.fn().mockResolvedValue(response),
        first: vi.fn().mockResolvedValue(null),
      };
    }),
  };
}

function createMockEnv(dbOverrides: Record<string, any> = {}) {
  return {
    DB: createMockDB(dbOverrides),
    RESEND_API_KEY: 'test-resend-key',
    DOMAIN: 'agentsmail.org',
    JWT_SECRET: 'test-jwt-secret-key-for-tests',
  };
}

function jsonRequest(method: string, url: string, body?: any, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

async function parseJson(response: Response): Promise<any> {
  return response.json();
}

// --- Tests ---

describe('JWT Module', () => {
  const secret = 'test-secret-1234';

  it('should sign and verify a JWT', async () => {
    const payload = { sub: 'user-1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJwt(payload, secret);

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified!.sub).toBe('user-1');
    expect(verified!.email).toBe('test@test.com');
    expect(verified!.iat).toBeDefined();
  });

  it('should reject expired JWT', async () => {
    const payload = { sub: 'user-1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) - 100 };
    const token = await signJwt(payload, secret);

    const verified = await verifyJwt(token, secret);
    expect(verified).toBeNull();
  });

  it('should reject JWT with wrong secret', async () => {
    const payload = { sub: 'user-1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJwt(payload, secret);

    const verified = await verifyJwt(token, 'wrong-secret');
    expect(verified).toBeNull();
  });

  it('should reject malformed tokens', async () => {
    expect(await verifyJwt('not-a-jwt', secret)).toBeNull();
    expect(await verifyJwt('a.b', secret)).toBeNull();
    expect(await verifyJwt('', secret)).toBeNull();
  });
});

describe('API Key Module', () => {
  it('should generate keys with am_sk_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^am_sk_[0-9a-f]{64}$/);
  });

  it('should hash deterministically', async () => {
    const key = 'am_sk_test_key_123';
    const hash1 = await hashApiKey(key);
    const hash2 = await hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should produce different hashes for different keys', async () => {
    const hash1 = await hashApiKey('am_sk_key1');
    const hash2 = await hashApiKey('am_sk_key2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('getUserFromRequest', () => {
  it('should extract user from Authorization header', async () => {
    const secret = 'test-jwt-secret-key-for-tests';
    const jwt = await signJwt(
      { sub: 'user-1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );

    const env = createMockEnv({
      'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1': {
        results: [{ session_invalidated_at: null }],
      },
    });

    const req = new Request('https://test.com', {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    const user = await getUserFromRequest(req, env as any);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe('user-1');
    expect(user!.email).toBe('test@test.com');
  });

  it('should return null for API key tokens', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com', {
      headers: { Authorization: 'Bearer am_sk_some_api_key' },
    });

    const user = await getUserFromRequest(req, env as any);
    expect(user).toBeNull();
  });

  it('should reject invalidated sessions', async () => {
    const secret = 'test-jwt-secret-key-for-tests';
    const jwt = await signJwt(
      { sub: 'user-1', email: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 7200 },
      secret
    );

    // session_invalidated_at is in the future, meaning all current JWTs (iat <= now) are invalid
    const env = createMockEnv({
      'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1': {
        results: [{ session_invalidated_at: Math.floor(Date.now() / 1000) + 100 }],
      },
    });

    const req = new Request('https://test.com', {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    const user = await getUserFromRequest(req, env as any);
    expect(user).toBeNull();
  });
});

describe('authenticateAgent', () => {
  it('should pass with valid API key', async () => {
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);

    const env = createMockEnv({
      'SELECT id FROM agents WHERE id = ? AND api_key_hash = ? AND is_active = 1': {
        results: [{ id: 'agent-1' }],
      },
    });

    const req = new Request('https://test.com', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const result = await authenticateAgent(req, env as any, 'agent-1');
    expect(result).toBeNull(); // null = auth passed
  });

  it('should reject invalid API key', async () => {
    const env = createMockEnv({
      'SELECT id FROM agents WHERE id = ? AND api_key_hash = ? AND is_active = 1': {
        results: [],
      },
      'SELECT id FROM agents WHERE id = ? AND prev_api_key_hash = ? AND is_active = 1': {
        results: [],
      },
    });

    const req = new Request('https://test.com', {
      headers: { Authorization: 'Bearer am_sk_invalid' },
    });

    const result = await authenticateAgent(req, env as any, 'agent-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json() as any;
    expect(body.error).toBe('Invalid API key or agent not found');
  });

  it('should return KEY_ROTATED for old rotated key', async () => {
    const env = createMockEnv({
      'SELECT id FROM agents WHERE id = ? AND api_key_hash = ? AND is_active = 1': {
        results: [],
      },
      'SELECT id FROM agents WHERE id = ? AND prev_api_key_hash = ? AND is_active = 1': {
        results: [{ id: 'agent-1' }],
      },
    });

    const req = new Request('https://test.com', {
      headers: { Authorization: 'Bearer am_sk_old_rotated_key' },
    });

    const result = await authenticateAgent(req, env as any, 'agent-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json() as any;
    expect(body.error.code).toBe('KEY_ROTATED');
  });

  it('should reject request with no auth', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com');

    const result = await authenticateAgent(req, env as any, 'agent-1');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe('POST /api/auth/magic-link', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  it('should reject invalid email', async () => {
    const env = createMockEnv();
    const req = jsonRequest('POST', 'https://test.com/api/auth/magic-link', { email: 'not-an-email' });

    const res = await handleSendMagicLink(req, env as any, {});
    expect(res.status).toBe(400);
  });

  it('should rate limit (5 min)', async () => {
    const env = createMockEnv({
      'SELECT id FROM magic_link_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ?) AND created_at > unixepoch() - 300 AND used_at IS NULL': {
        results: [{ id: 'existing-token' }],
      },
    });

    const req = jsonRequest('POST', 'https://test.com/api/auth/magic-link', { email: 'test@test.com' });
    const res = await handleSendMagicLink(req, env as any, {});
    expect(res.status).toBe(429);
    const body = await parseJson(res);
    expect(body.error).toContain('5 minutes');
  });

  it('should send magic link for new user', async () => {
    const env = createMockEnv();
    const req = jsonRequest('POST', 'https://test.com/api/auth/magic-link', { email: 'new@test.com' });

    const res = await handleSendMagicLink(req, env as any, {});
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.ok).toBe(true);
    expect(body.message).toContain('inbox');
  });
});

describe('GET /api/auth/verify', () => {
  it('should reject missing token', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/auth/verify');

    const res = await handleVerifyMagicLink(req, env as any, {});
    expect(res.status).toBe(400);
  });

  it('should reject invalid token prefix', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/auth/verify?token=invalid_token');

    const res = await handleVerifyMagicLink(req, env as any, {});
    expect(res.status).toBe(400);
  });

  it('should reject expired/used token', async () => {
    const env = createMockEnv(); // empty results = not found
    const req = new Request('https://test.com/api/auth/verify?token=mlk_abcdef1234567890');

    const res = await handleVerifyMagicLink(req, env as any, {});
    expect(res.status).toBe(401);
  });

  it('should verify valid token and return JWT', async () => {
    const env = createMockEnv({
      'SELECT mt.id, mt.user_id, u.email FROM magic_link_tokens mt JOIN users u ON mt.user_id = u.id WHERE mt.token_hash = ? AND mt.expires_at > ? AND mt.used_at IS NULL': {
        results: [{ id: 'token-1', user_id: 'user-1', email: 'test@test.com' }],
      },
    });

    const req = new Request('https://test.com/api/auth/verify?token=mlk_abcdef');
    const res = await handleVerifyMagicLink(req, env as any, {});
    expect(res.status).toBe(200);

    const body = await parseJson(res);
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe('test@test.com');

    // Verify the returned JWT is valid
    const payload = await verifyJwt(body.token, env.JWT_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
  });
});

describe('POST /api/auth/logout', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/auth/logout', { method: 'POST' });

    const res = await handleLogout(req, env as any, {});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/auth/me');

    const res = await handleGetMe(req, env as any, {});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/agents/claim (Method B)', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = jsonRequest('POST', 'https://test.com/api/agents/claim', {
      agent_email: 'agent@agentsmail.org',
      api_key: 'am_sk_test',
    });

    const res = await handleClaimAgent(req, env as any, {});
    expect(res.status).toBe(401);
  });

  it('should reject missing fields', async () => {
    const secret = 'test-jwt-secret-key-for-tests';
    const jwt = await signJwt(
      { sub: 'user-1', email: 'owner@test.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );

    const env = createMockEnv({
      'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1': {
        results: [{ session_invalidated_at: null }],
      },
    });

    const req = jsonRequest('POST', 'https://test.com/api/agents/claim', { agent_email: 'test@agentsmail.org' }, {
      Authorization: `Bearer ${jwt}`,
    });

    const res = await handleClaimAgent(req, env as any, {});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/claim/confirm (Method A)', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/auth/claim/confirm?code=123456&agent_id=agent-1');

    const res = await handleConfirmClaim(req, env as any, {});
    expect(res.status).toBe(401);
  });

  it('should reject missing params', async () => {
    const secret = 'test-jwt-secret-key-for-tests';
    const jwt = await signJwt(
      { sub: 'user-1', email: 'owner@test.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );

    const env = createMockEnv({
      'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1': {
        results: [{ session_invalidated_at: null }],
      },
    });

    const req = new Request('https://test.com/api/auth/claim/confirm', {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    const res = await handleConfirmClaim(req, env as any, {});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/agents/:id/owner', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/agents/agent-1/owner', { method: 'DELETE' });

    const res = await handleRemoveOwner(req, env as any, { agentId: 'agent-1' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/agents (auth-scoped listing)', () => {
  it('should reject unauthenticated request', async () => {
    const env = createMockEnv();
    const req = new Request('https://test.com/api/agents');

    const res = await handleListAgents(req, env as any, {});
    expect(res.status).toBe(401);
  });

  it('should return agents for API key auth', async () => {
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);

    const env = createMockEnv({
      'SELECT id, email, name, description, created_at, is_active, trust_tier FROM agents WHERE api_key_hash = ? AND is_active = 1': {
        results: [{ id: 'agent-1', email: 'test@agentsmail.org', name: 'test', description: null, created_at: 1234, is_active: 1, trust_tier: 0 }],
      },
    });

    const req = new Request('https://test.com/api/agents', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const res = await handleListAgents(req, env as any, {});
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('test');
  });
});

describe('POST /api/agents (with owner linking)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  it('should create agent and auto-link when JWT present', async () => {
    const secret = 'test-jwt-secret-key-for-tests';
    const jwt = await signJwt(
      { sub: 'user-1', email: 'owner@test.com', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );

    const env = createMockEnv({
      'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1': {
        results: [{ session_invalidated_at: null }],
      },
    });

    const req = jsonRequest('POST', 'https://test.com/api/agents', { name: 'test-agent' }, {
      Authorization: `Bearer ${jwt}`,
    });

    const res = await handleCreateAgent(req, env as any, {});
    expect(res.status).toBe(201);

    const body = await parseJson(res);
    expect(body.api_key).toMatch(/^am_sk_/);
    expect(body.email).toContain('@agentsmail.org');
  });

  it('should create agent without name (Tier 0 uses random slug)', async () => {
    const env = createMockEnv();
    const req = jsonRequest('POST', 'https://test.com/api/agents', {});

    const res = await handleCreateAgent(req, env as any, {});
    expect(res.status).toBe(201);

    const body = await parseJson(res);
    expect(body.api_key).toMatch(/^am_sk_/);
    expect(body.email).toMatch(/^[a-z][-a-z]+-[a-z0-9]{4}@agentsmail\.org$/);
    expect(body.trust_tier).toBe(0);
  });
});

describe('Database Migration Schema (#28)', () => {
  it('should define all required tables in migration 006', async () => {
    const { readFileSync } = await import('fs');
    const sql = readFileSync('./migrations/006_user_auth.sql', 'utf-8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS magic_link_tokens');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_owner_claims');
    expect(sql).toContain('ALTER TABLE agents ADD COLUMN owner_id');
    expect(sql).toContain('session_invalidated_at');
    expect(sql).toContain('verification_code');
  });

  it('should seed test user in migration 007', async () => {
    const { readFileSync } = await import('fs');
    const sql = readFileSync('./migrations/007_seed_test_user.sql', 'utf-8');

    expect(sql).toContain('usr_test_owner');
    expect(sql).toContain('test@example.com');
    expect(sql).toContain('UPDATE agents SET owner_id');
  });
});
