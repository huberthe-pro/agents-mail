import { Env } from '../types';
import { generateId, nowUnix, v4Response, v4Error } from '../utils';
import { validateAgentName } from '../middleware/validation';

/**
 * POST /api/upgrade — v0.4 combined name binding + owner verification.
 * Agent resolved from API key by router (params.agentId injected).
 */
export async function handleUpgrade(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const { DB, DOMAIN, RESEND_API_KEY } = env;
  const agentId = params.agentId;

  const body = await request.json() as any;
  const ownerEmail = body.owner_email;
  const name = body.name;

  if (!ownerEmail) {
    return v4Error('VALIDATION_ERROR', 'owner_email is required', 400);
  }

  // Get agent
  const agent = await DB.prepare(
    'SELECT id, email, name, trust_tier, owner_id, name_bound_at FROM agents WHERE id = ? AND is_active = 1',
  ).bind(agentId).first<{
    id: string; email: string; name: string; trust_tier: number;
    owner_id: string | null; name_bound_at: number | null;
  }>();

  if (!agent) {
    return v4Error('NOT_FOUND', 'Agent not found', 404);
  }

  // Already has owner?
  if (agent.owner_id) {
    return v4Error('ALREADY_UPGRADED', 'This mailbox already has an owner linked.', 409);
  }

  // Validate name if provided
  if (name) {
    if (agent.name_bound_at) {
      return v4Error('NAME_ALREADY_BOUND', 'Custom name can only be set once.', 409);
    }
    const nameError = validateAgentName(name);
    if (nameError) return nameError;
  }

  // Create claim + send magic link
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = nowUnix() + 900; // 15 minutes
  const claimId = generateId();
  const normalizedEmail = ownerEmail.toLowerCase().trim();

  await DB.prepare(
    'INSERT INTO agent_owner_claims (id, agent_id, owner_email, verification_code, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(claimId, agentId, normalizedEmail, code, expiresAt).run();

  // If name requested, store it in claim metadata for post-confirm processing
  if (name) {
    await DB.prepare(
      'UPDATE agent_owner_claims SET metadata_json = ? WHERE id = ?',
    ).bind(JSON.stringify({ requested_name: name }), claimId).run();
  }

  const confirmUrl = `https://agentsmail.org/auth/claim?code=${code}&agent_id=${agentId}`;
  const futureEmail = name ? `${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}@${DOMAIN}` : null;

  // Send verification email
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Agents Mail <noreply@agentsmail.org>',
      to: [normalizedEmail],
      subject: `Upgrade your agent ${agent.name}`,
      html: `
        <h2>Upgrade Agent Mailbox</h2>
        <p>Your agent <strong>${agent.name}</strong> (${agent.email}) wants to upgrade.</p>
        ${futureEmail ? `<p>New email address: <strong>${futureEmail}</strong></p>` : ''}
        <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#00d4ff;color:#0a0a0f;text-decoration:none;border-radius:6px;font-weight:bold;">Confirm Upgrade</a></p>
        <p style="color:#666;font-size:12px;">This link expires in 15 minutes.</p>
      `,
    }),
  });

  const response: Record<string, unknown> = {
    status: 'verification_sent',
    owner_email: normalizedEmail,
    expires_in_seconds: 900,
    after_upgrade: {
      tier_level: 1,
      unlimited_sends: true,
      webhooks: true,
      contacts: true,
      acl: true,
    },
  };

  if (futureEmail) {
    response.future_email = futureEmail;
  }

  return v4Response(response);
}
