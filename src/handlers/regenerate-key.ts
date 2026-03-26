import { Env } from '../types';
import { jsonResponse, nowUnix } from '../utils';
import { generateApiKey, hashApiKey } from '../middleware/auth';
import { getUserFromRequest } from '../middleware/jwt';
import { writeAuditLog } from './admin/audit';

/**
 * POST /api/agents/:agentId/regenerate-key
 * Regenerate the API key for an agent. JWT owner only — API Key auth is rejected.
 * Returns the new key plaintext exactly once; the old key is immediately invalidated.
 */
export async function handleRegenerateKey(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');

  // Explicitly reject API Key auth
  if (authHeader?.startsWith('Bearer am_sk_')) {
    return jsonResponse({ error: 'API key regeneration requires JWT authentication (dashboard login). API Key auth is not accepted.' }, 403);
  }

  // Require JWT auth
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Not authenticated. Please log in to the dashboard.' }, 401);
  }

  const agentId = params.agentId;

  // Verify the JWT user is the agent's owner
  const agent = await env.DB.prepare(
    'SELECT id, name, email, owner_id FROM agents WHERE id = ? AND is_active = 1',
  ).bind(agentId).first<{ id: string; name: string; email: string; owner_id: string | null }>();

  if (!agent) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  if (agent.owner_id !== user.userId) {
    return jsonResponse({ error: 'You are not the owner of this agent' }, 403);
  }

  // Generate new key and hash
  const newApiKey = generateApiKey();
  const newKeyHash = await hashApiKey(newApiKey);

  // Rotate: save current hash as prev (for KEY_ROTATED detection), set new hash
  const now = nowUnix();
  await env.DB.prepare(
    'UPDATE agents SET prev_api_key_hash = api_key_hash, key_rotated_at = ?, api_key_hash = ? WHERE id = ?',
  ).bind(now, newKeyHash, agentId).run();

  // Write audit log
  writeAuditLog(env, user.email, 'regenerate_api_key', 'agent', agentId, {
    agent_name: agent.name,
    agent_email: agent.email,
  }).catch(console.error);

  return jsonResponse({
    api_key: newApiKey,
    message: 'API key regenerated. The old key is now invalid.',
  });
}
