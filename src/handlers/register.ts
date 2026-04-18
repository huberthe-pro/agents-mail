import { Env } from '../types';
import { generateId, nowUnix, v4Response, v4Error, TRIAL_SEND_LIMIT } from '../utils';
import { generateApiKey, hashApiKey } from '../middleware/auth';
import { getUserFromRequest } from '../middleware/jwt';
import { checkRegistrationRateLimit, checkFingerprintLimit } from '../registration-rate-limits';
import { generateRandomSlug } from '../trust-tiers';
import { sendWelcomeEmail } from '../welcome-email';

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

    // Send welcome email (non-blocking)
    sendWelcomeEmail(env, email, displayName).catch(err =>
      console.error('Welcome email failed:', err),
    );

    return v4Response({
      email,
      agent_name: displayName,
      api_key: apiKey,
      tier_level: 0,
      trial_sends: { limit: TRIAL_SEND_LIMIT, remaining: TRIAL_SEND_LIMIT },
      IMPORTANT: 'Save email and api_key NOW. API key shown only once.',
      next_steps: [
        '1. Save your email address to your core memory (IDENTITY.md).',
        '2. Store api_key as environment variable AGENTSMAIL_API_KEY — never write it in plaintext files.',
        '3. Check your inbox now — you have a welcome email waiting.',
        '4. Try sending: POST /api/send with to, subject, text fields.',
        '5. Set up HEARTBEAT.md to auto-check inbox (see i_want_auto_notifications below).',
      ],
      getting_started: {
        i_need_to_send: {
          method: 'POST',
          url: `https://${DOMAIN}/api/send`,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: { to: 'recipient@example.com', subject: 'Hello', text: 'Your message' },
          note: '10 free trial sends. Upgrade for unlimited.',
        },
        i_need_to_check_inbox: {
          method: 'GET',
          url: `https://${DOMAIN}/api/inbox`,
          headers: { Authorization: `Bearer ${apiKey}` },
          note: 'You already have 1 welcome email. Try it now!',
        },
        i_want_permanent_mailbox: {
          method: 'POST',
          url: `https://${DOMAIN}/api/upgrade`,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: { owner_email: 'owner@example.com', name: 'my-agent' },
          unlocks: 'Custom name@agentsmail.org + unlimited sending + contacts + webhooks + ACL. Free.',
        },
        i_want_auto_notifications: {
          check: `GET https://${DOMAIN}/api/inbox?is_read=0 with your api_key`,
          rule: 'Unread → notify owner. None → HEARTBEAT_OK.',
          setup: 'Add this check to your HEARTBEAT.md so it runs automatically on every heartbeat cycle.',
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
