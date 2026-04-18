import { Env } from '../types';
import { generateId, jsonResponse, nowUnix } from '../utils';
import { hashApiKey } from '../middleware/auth';
import { getUserFromRequest } from '../middleware/jwt';
import { maybeUpgradeTier } from '../trust-tiers';
import { writeAuditLog } from './admin/audit';

/**
 * POST /api/agents/claim
 * Human claims an existing agent using its API Key (方式 B).
 */
export async function handleClaimAgent(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const { agent_email, api_key } = await request.json() as any;

  if (!agent_email || !api_key) {
    return jsonResponse({ error: 'agent_email and api_key are required' }, 400);
  }

  // Find agent by email
  const { results: agents } = await env.DB.prepare(
    'SELECT id, name, email, owner_id, api_key_hash FROM agents WHERE email = ? AND is_active = 1'
  ).bind(agent_email.toLowerCase().trim()).all();

  if (agents.length === 0) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  const agent = agents[0] as any;

  // Check if already has an owner
  if (agent.owner_id) {
    return jsonResponse({ error: 'This agent already has an owner' }, 409);
  }

  // Verify API Key
  const keyHash = await hashApiKey(api_key);
  if (keyHash !== agent.api_key_hash) {
    return jsonResponse({ error: 'Invalid API key' }, 403);
  }

  // Set owner
  await env.DB.prepare(
    'UPDATE agents SET owner_id = ? WHERE id = ?'
  ).bind(user.userId, agent.id).run();

  // Trigger trust tier upgrade check — must await
  await maybeUpgradeTier(env, agent.id);

  writeAuditLog(env, user.email, 'owner.claim', 'agent', agent.id, { agent_email, method: 'api_key' }, 'user').catch(() => {});

  return jsonResponse({
    ok: true,
    agent: { id: agent.id, name: agent.name, email: agent.email },
  });
}

/**
 * GET /api/auth/claim/confirm?code=xxx&agent_id=yyy
 * Confirm Agent-Owner linking from email (方式 A).
 * No JWT required — the verification code itself proves the user owns the email.
 */
export async function handleConfirmClaim(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const agentId = url.searchParams.get('agent_id');

  if (!code || !agentId) {
    return jsonResponse({ error: 'code and agent_id are required' }, 400);
  }

  const now = nowUnix();

  // Find valid claim
  const { results: claims } = await env.DB.prepare(
    'SELECT id, owner_email, metadata_json FROM agent_owner_claims WHERE agent_id = ? AND verification_code = ? AND status = ? AND expires_at > ?'
  ).bind(agentId, code, 'pending', now).all();

  if (claims.length === 0) {
    return jsonResponse({ error: 'Invalid or expired verification code' }, 400);
  }

  const claim = claims[0] as any;

  // Check agent doesn't already have an owner
  const { results: agents } = await env.DB.prepare(
    'SELECT owner_id FROM agents WHERE id = ?'
  ).bind(agentId).all();

  if (agents.length === 0) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  if ((agents[0] as any).owner_id) {
    return jsonResponse({ error: 'This agent already has an owner' }, 409);
  }

  // Find or create user by owner_email from the claim
  let userId: string;
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(claim.owner_email).first<{ id: string }>();

  if (existingUser) {
    userId = existingUser.id;
  } else {
    userId = generateId();
    await env.DB.prepare(
      'INSERT INTO users (id, email) VALUES (?, ?)'
    ).bind(userId, claim.owner_email).run();
  }

  // Confirm the claim
  await env.DB.prepare(
    'UPDATE agent_owner_claims SET status = ?, confirmed_at = unixepoch() WHERE id = ?'
  ).bind('confirmed', claim.id).run();

  await env.DB.prepare(
    'UPDATE agents SET owner_id = ? WHERE id = ?'
  ).bind(userId, agentId).run();

  // Trigger trust tier upgrade check — must await to prevent Workers from killing it
  await maybeUpgradeTier(env, agentId);

  // If upgrade claim had a requested name, apply it
  const claimMeta = (claim as any).metadata_json;
  if (claimMeta) {
    try {
      const { requested_name } = JSON.parse(claimMeta);
      if (requested_name) {
        const newEmail = `${requested_name}@${env.DOMAIN}`;
        // Check uniqueness
        const existing = await env.DB.prepare(
          'SELECT id FROM agents WHERE email = ? AND id != ?'
        ).bind(newEmail, agentId).first();
        if (!existing) {
          await env.DB.prepare(
            'UPDATE agents SET email = ?, name = ?, name_bound_at = ? WHERE id = ?'
          ).bind(newEmail, requested_name, nowUnix(), agentId).run();
        }
      }
    } catch (e) {
      console.error('Failed to apply requested name:', e);
    }
  }

  writeAuditLog(env, claim.owner_email, 'owner.confirm', 'agent', agentId, { method: 'email_verification' }, 'user').catch(() => {});

  return jsonResponse({
    ok: true,
    message: 'Agent successfully linked to your account',
  });
}

/**
 * DELETE /api/agents/:agentId/owner
 * Remove owner link (human releases an agent).
 */
export async function handleRemoveOwner(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const agentId = params.agentId;

  // Verify ownership
  const { results } = await env.DB.prepare(
    'SELECT id FROM agents WHERE id = ? AND owner_id = ?'
  ).bind(agentId, user.userId).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Agent not found or you are not the owner' }, 403);
  }

  await env.DB.prepare(
    'UPDATE agents SET owner_id = NULL WHERE id = ?'
  ).bind(agentId).run();

  writeAuditLog(env, user.email, 'owner.remove', 'agent', agentId, {}, 'user').catch(() => {});

  return jsonResponse({ ok: true, message: 'Owner link removed' });
}
