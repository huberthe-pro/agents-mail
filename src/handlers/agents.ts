import { Env } from '../types';
import { generateId, jsonResponse, nowUnix } from '../utils';
import { generateApiKey, hashApiKey } from '../middleware/auth';
import { validateAgentName } from '../middleware/validation';
import { getUserFromRequest } from '../middleware/jwt';
import { checkRegistrationRateLimit, checkFingerprintLimit } from '../registration-rate-limits';
import { generateRandomSlug } from '../trust-tiers';
import { writeAuditLog } from './admin/audit';

/**
 * POST /api/agents
 * Agent applies for a mailbox. Optionally declares owner_email for linking.
 */
export async function handleCreateAgent(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  // Rate limit by IP
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
  const rateCheck = await checkRegistrationRateLimit(env, ip);
  if (!rateCheck.allowed) {
    return jsonResponse({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many agent registrations. Please try again later.',
      },
    }, 429);
  }

  // Fingerprint-based abuse detection
  const fpCheck = await checkFingerprintLimit(env, request, ip);
  if (!fpCheck.allowed) {
    return jsonResponse({
      error: {
        code: 'RATE_LIMITED',
        message: 'Registration limit reached. Please try again later.',
      },
    }, 429);
  }

  const { DB, DOMAIN } = env;
  const { name, owner_email, description } = await request.json() as any;

  // Validate description length
  const desc = description ? String(description).slice(0, 500) : null;

  // Tier 0: random slug address, name is optional display name
  const slug = generateRandomSlug();
  const id = generateId();
  const email = `${slug}@${DOMAIN}`;
  const displayName = name || slug;
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  // Check if caller is a logged-in human (JWT)
  const user = await getUserFromRequest(request, env);
  const ownerId = user?.userId || null;

  try {
    const createdAt = nowUnix();
    await DB.prepare(
      'INSERT INTO agents (id, email, name, api_key_hash, owner_id, description, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, displayName, apiKeyHash, ownerId, desc, createdAt).run();

    // If owner_email provided and no JWT user, trigger claim flow (方式 A)
    if (owner_email && !ownerId) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = nowUnix() + 900; // 15 minutes
      const claimId = generateId();

      await DB.prepare(
        'INSERT INTO agent_owner_claims (id, agent_id, owner_email, verification_code, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(claimId, id, owner_email.toLowerCase().trim(), code, expiresAt).run();

      // Send verification email
      const confirmUrl = `https://agentsmail.org/auth/claim?code=${code}&agent_id=${id}`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Agents Mail <noreply@agentsmail.org>',
          to: [owner_email.toLowerCase().trim()],
          subject: `🤖 Link agent ${displayName} to your account`,
          html: `
            <h2>Agent Ownership Verification</h2>
            <p>Your agent <strong>${displayName}</strong> (${email}) has requested to link with your account.</p>
            <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#00d4ff;color:#0a0a0f;text-decoration:none;border-radius:6px;font-weight:bold;">Confirm Ownership</a></p>
            <p style="color:#666;font-size:12px;">This link expires in 15 minutes.</p>
          `,
        }),
      });
    }

    return jsonResponse({ id, email, name: displayName, api_key: apiKey, trust_tier: 0 }, 201);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return jsonResponse({ error: 'Agent name already exists' }, 409);
    }
    throw error;
  }
}

/**
 * GET /api/agents
 * List agents. Requires authentication.
 * - JWT: returns only agents owned by the user
 * - API Key: returns the agent associated with that key
 */
export async function handleListAgents(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;

  // Try JWT auth first (human dashboard)
  const user = await getUserFromRequest(request, env);
  if (user) {
    const { results } = await DB.prepare(
      'SELECT id, email, name, description, created_at, is_active, trust_tier FROM agents WHERE owner_id = ? ORDER BY created_at DESC'
    ).bind(user.userId).all();
    return jsonResponse(results);
  }

  // Try API Key auth (agent/CLI)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer am_sk_')) {
    const apiKey = authHeader.slice(7);
    const keyHash = await hashApiKey(apiKey);
    const { results } = await DB.prepare(
      'SELECT id, email, name, description, created_at, is_active, trust_tier FROM agents WHERE api_key_hash = ? AND is_active = 1'
    ).bind(keyHash).all();
    return jsonResponse(results);
  }

  return jsonResponse({ error: 'Authentication required' }, 401);
}

export async function handleGetAgent(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const id = params.agentId;
  const { results } = await DB.prepare(
    'SELECT id, email, name, description, created_at, is_active, trust_tier FROM agents WHERE id = ?'
  ).bind(id).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }
  return jsonResponse(results[0]);
}

export async function handleDeleteAgent(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const id = params.agentId;

  await DB.prepare(
    'UPDATE agents SET is_active = 0 WHERE id = ?'
  ).bind(id).run();

  writeAuditLog(env, id, 'agent.deactivate', 'agent', id, {}, 'agent').catch(() => {});

  return jsonResponse({ ok: true, message: 'Agent deactivated' });
}

/**
 * POST /api/agents/:agentId/name
 * Bind a readable name to an agent. Requires Trust Tier 1+.
 */
export async function handleBindAgentName(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB, DOMAIN } = env;
  const agentId = params.agentId;
  const { name } = await request.json() as any;

  const nameError = validateAgentName(name);
  if (nameError) return nameError;

  // Check trust tier and prior binding
  const agent = await DB.prepare(
    'SELECT id, trust_tier, name_bound_at FROM agents WHERE id = ?'
  ).bind(agentId).first<{ id: string; trust_tier: number; name_bound_at: number | null }>();

  if (!agent) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  if ((agent.trust_tier ?? 0) < 1) {
    return jsonResponse({
      error: {
        code: 'TIER_RESTRICTED',
        message: 'Binding a name requires Trust Tier 1+. Gain 3 mutual contacts or link an owner.',
      },
    }, 403);
  }

  if (agent.name_bound_at) {
    return jsonResponse({
      error: {
        code: 'NAME_ALREADY_BOUND',
        message: 'Custom name can only be set once. Contact support to request a change.',
      },
    }, 409);
  }

  const newEmail = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}@${DOMAIN}`;

  try {
    await DB.prepare(
      'UPDATE agents SET name = ?, email = ?, name_bound_at = ? WHERE id = ?'
    ).bind(name, newEmail, nowUnix(), agentId).run();

    writeAuditLog(env, agentId, 'agent.bind_name', 'agent', agentId, { name, new_email: newEmail }, 'agent').catch(() => {});

    return jsonResponse({ ok: true, name, email: newEmail });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return jsonResponse({ error: 'This name is already taken' }, 409);
    }
    throw error;
  }
}
