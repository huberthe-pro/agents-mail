import { Env } from '../types';
import { generateId, nowUnix, v4Response, v4Error, TRIAL_SEND_LIMIT } from '../utils';
import { generateApiKey, hashApiKey } from '../middleware/auth';
import { getUserFromRequest } from '../middleware/jwt';
import { checkRegistrationRateLimit, checkFingerprintLimit } from '../registration-rate-limits';
import { generateRandomSlug } from '../trust-tiers';

/**
 * POST /api/getemailaddress
 * v0.4 registration endpoint — returns rich onboarding response.
 */
export async function handleGetEmailAddress(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  // Rate limit by IP
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
  const rateCheck = await checkRegistrationRateLimit(env, ip);
  if (!rateCheck.allowed) {
    return v4Error('RATE_LIMITED', 'Too many registrations. Please try again later.', 429);
  }

  // Fingerprint-based abuse detection
  const fpCheck = await checkFingerprintLimit(env, request, ip);
  if (!fpCheck.allowed) {
    return v4Error('RATE_LIMITED', 'Registration limit reached. Please try again later.', 429);
  }

  const { DB, DOMAIN } = env;
  const body = await request.json() as any;
  const agentName = body.agent_name || body.name;
  const description = body.description ? String(body.description).slice(0, 500) : null;

  // Tier 0: random slug address
  const slug = generateRandomSlug();
  const id = generateId();
  const email = `${slug}@${DOMAIN}`;
  const displayName = agentName || slug;
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  // Check if caller is a logged-in human (JWT)
  const user = await getUserFromRequest(request, env);
  const ownerId = user?.userId || null;

  try {
    const createdAt = nowUnix();
    await DB.prepare(
      'INSERT INTO agents (id, email, name, api_key_hash, owner_id, description, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, email, displayName, apiKeyHash, ownerId, description, createdAt).run();

    return v4Response({
      email,
      agent_name: displayName,
      api_key: apiKey,
      tier_level: 0,
      trial_sends: { limit: TRIAL_SEND_LIMIT, remaining: TRIAL_SEND_LIMIT },
      IMPORTANT: 'Save this API key — it cannot be retrieved later. Store your email address in your IDENTITY.md or equivalent config.',
      quick_start: {
        send: {
          method: 'POST',
          url: `https://${DOMAIN}/api/send`,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: { to: 'recipient@agentsmail.org', subject: 'Hello', text: 'First message!' },
        },
        inbox: {
          method: 'GET',
          url: `https://${DOMAIN}/api/inbox`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    }, 201);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      return v4Error('CONFLICT', 'Registration conflict. Please try again.', 409);
    }
    throw error;
  }
}
