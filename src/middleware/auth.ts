import { Env, AgentRecord } from '../types';
import { jsonResponse, v4Error, TRIAL_SEND_LIMIT } from '../utils';
import { getUserFromRequest } from './jwt';

/**
 * Hash an API key using SHA-256 for storage comparison.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random API key with prefix.
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `am_sk_${key}`;
}

/**
 * Authenticate a request against a specific agent.
 * Supports two modes:
 * - API Key (am_sk_...): Agent authenticates itself via CLI/API
 * - JWT: Human owner authenticates via Dashboard
 *
 * Returns null if auth passes, or a Response with error.
 */
export async function authenticateAgent(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response | null> {
  const authHeader = request.headers.get('Authorization');

  // Mode 1: API Key authentication (for AI agents via CLI/API)
  if (authHeader?.startsWith('Bearer am_sk_')) {
    const apiKey = authHeader.slice(7);
    const keyHash = await hashApiKey(apiKey);

    // Check current key
    const { results } = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND api_key_hash = ? AND is_active = 1'
    ).bind(agentId, keyHash).all();

    if (results.length > 0) {
      return null; // Current key is valid
    }

    // Check if this is a rotated (old) key
    const rotated = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND prev_api_key_hash = ? AND is_active = 1'
    ).bind(agentId, keyHash).all();

    if (rotated.results.length > 0) {
      return jsonResponse({
        error: {
          code: 'KEY_ROTATED',
          message: 'This API key has been rotated by the agent owner. Please contact the owner for the new key.',
        },
      }, 403);
    }

    return jsonResponse({ error: 'Invalid API key or agent not found' }, 403);
  }

  // Mode 2: JWT authentication (for human owners via Dashboard)
  const user = await getUserFromRequest(request, env);
  if (user) {
    const { results } = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND owner_id = ? AND is_active = 1'
    ).bind(agentId, user.userId).all();

    if (results.length === 0) {
      return jsonResponse({ error: 'Agent not found or you are not the owner' }, 403);
    }
    return null;
  }

  // No valid auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
  }

  return jsonResponse({ error: 'Invalid credentials' }, 403);
}

/**
 * v0.4: Resolve agent purely from API Key (no agentId in URL).
 * Returns { agent } on success, or an error Response.
 */
export async function resolveAgentFromAuth(
  request: Request,
  env: Env,
): Promise<{ agent: AgentRecord } | Response> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer am_sk_')) {
    return v4Error('UNAUTHORIZED', 'Missing or invalid API key. Use: Authorization: Bearer am_sk_...', 401);
  }

  const apiKey = authHeader.slice(7);
  const keyHash = await hashApiKey(apiKey);

  // Look up agent by api_key_hash (uses idx_agents_api_key_hash)
  const agent = await env.DB.prepare(
    'SELECT id, email, name, trust_tier, owner_id FROM agents WHERE api_key_hash = ? AND is_active = 1',
  ).bind(keyHash).first<AgentRecord>();

  if (agent) {
    return { agent };
  }

  // Check rotated key
  const rotated = await env.DB.prepare(
    'SELECT id FROM agents WHERE prev_api_key_hash = ? AND is_active = 1',
  ).bind(keyHash).first();

  if (rotated) {
    return v4Error('KEY_ROTATED', 'This API key has been rotated. Please contact the mailbox owner for the new key.', 403);
  }

  return v4Error('UNAUTHORIZED', 'Invalid API key.', 401);
}

/**
 * Get remaining trial sends for a Tier 0 mailbox.
 */
export async function getTrialSendsRemaining(env: Env, agentId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as c FROM sent_emails WHERE agent_id = ?',
  ).bind(agentId).first<{ c: number }>();
  return Math.max(0, TRIAL_SEND_LIMIT - (row?.c ?? 0));
}
