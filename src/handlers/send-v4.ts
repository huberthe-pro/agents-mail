import { Env, AgentRecord } from '../types';
import { generateId, jsonResponse, v4Response, v4Error, TRIAL_SEND_LIMIT } from '../utils';
import { getTrialSendsRemaining } from '../middleware/auth';
import { validateEmail } from '../middleware/validation';
import { sanitizeHtml } from '../mail';
import { encryptEmailFields } from '../encryption';
import { writeEmailEvent } from '../email-events';
import { releaseOutboundSendSlot, reserveOutboundSendSlot } from '../email-rate-limits';
import { upsertContactDirection } from '../contact-graph';
import { maybeUpgradeTier } from '../trust-tiers';

/**
 * POST /api/send — v0.4 send endpoint.
 * Tier 0: trial quota (10 sends), Tier 1+: unlimited.
 * Agent resolved from API key by router (params.agentId injected).
 */
export async function handleSendV4(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const { DB, RESEND_API_KEY } = env;
  const agentId = params.agentId;

  const body = await request.json() as any;
  const to = body.to;
  const subject = body.subject;
  const text = body.text || body.content?.text;
  const html = body.html || body.content?.html;
  const metadata = body.metadata || body.content?.metadata || null;
  const replyTo = body.reply_to || body.reply?.to;

  if (!to || !subject || !text) {
    return v4Error('VALIDATION_ERROR', 'Missing required fields: to, subject, text', 400);
  }

  const emailError = validateEmail(to);
  if (emailError) return emailError;

  // Get agent info
  const agent = await DB.prepare(
    'SELECT email, name, trust_tier FROM agents WHERE id = ?',
  ).bind(agentId).first<{ email: string; name: string; trust_tier: number }>();

  if (!agent) {
    return v4Error('NOT_FOUND', 'Agent not found', 404);
  }

  // Tier 0: check trial quota
  if ((agent.trust_tier ?? 0) < 1) {
    const remaining = await getTrialSendsRemaining(env, agentId);
    if (remaining <= 0) {
      return v4Error('TRIAL_QUOTA_EXCEEDED', 'You have used all 10 trial sends. Upgrade to Tier 1 for unlimited sending.', 403, {
        upgrade: { method: 'POST', path: '/api/upgrade', description: 'Link an owner email to upgrade' },
      });
    }
  }

  // Rate limit
  const rateLimit = await reserveOutboundSendSlot(env, agentId);
  if (!rateLimit.allowed) {
    await writeEmailEvent(env, agentId, 'outbound', 'rate_limited', null, { limit: rateLimit.limit, to, subject });
    return v4Error('RATE_LIMITED', 'Outbound email rate limit exceeded', 429);
  }

  let providerAccepted = false;
  const sanitizedHtml = html ? sanitizeHtml(html) : null;

  try {
    // Growth signature for Tier 0-1
    const addSignature = (agent.trust_tier ?? 0) <= 1;
    const textForSend = addSignature
      ? text + '\n\n---\nSent via Agents Mail - agentsmail.org'
      : text;
    const htmlForSend = sanitizedHtml && addSignature
      ? sanitizedHtml + '<br><hr style="border:none;border-top:1px solid #eee;margin:20px 0"><p style="font-size:12px;color:#999">Sent via <a href="https://agentsmail.org">Agents Mail</a></p>'
      : sanitizedHtml;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${agent.name} <${agent.email}>`,
        to: [to],
        subject: `🤖 ${subject}`,
        text: textForSend,
        ...(htmlForSend ? { html: htmlForSend } : {}),
        reply_to: replyTo,
      }),
    });

    providerAccepted = resendResponse.ok;
    const resendData = await resendResponse.json() as any;

    if (!resendResponse.ok) {
      console.error('Resend error:', resendData);
      await releaseOutboundSendSlot(env, agentId, rateLimit.reservation);
      return v4Error('SEND_FAILED', 'Failed to send email', 500);
    }

    // Encrypt and save
    const id = generateId();
    const encrypted = await encryptEmailFields(env, text, sanitizedHtml);
    await DB.prepare(`
      INSERT INTO sent_emails (id, agent_id, to_address, subject, body_text, metadata_json, body_html, resend_id, delivery_status,
                               is_encrypted, encryption_iv, encryption_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, agentId, to, subject, encrypted.body_text,
      metadata ? JSON.stringify(metadata) : null,
      encrypted.body_html, resendData.id, 'sent',
      encrypted.is_encrypted, encrypted.encryption_iv, encrypted.encryption_version,
    ).run();

    // Update last activity
    DB.prepare('UPDATE agents SET last_activity_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), agentId).run().catch(() => {});

    await writeEmailEvent(env, agentId, 'outbound', 'sent', id, { to, subject, has_html: Boolean(sanitizedHtml) });

    // Contact graph
    upsertContactDirection(env, agentId, to, '', 'outbound')
      .then(result => { if (result.upgraded) maybeUpgradeTier(env, agentId).catch(console.error); })
      .catch(err => console.error('Contact graph update failed:', err));

    // Build response
    const responseData: Record<string, unknown> = { id, status: 'sent' };

    // Tier 0: attach remaining sends info
    if ((agent.trust_tier ?? 0) < 1) {
      const remaining = await getTrialSendsRemaining(env, agentId);
      responseData.trial_sends = { limit: TRIAL_SEND_LIMIT, remaining };
      if (remaining <= 3) {
        responseData.upgrade_hint = 'Running low on trial sends. POST /api/upgrade to unlock unlimited sending.';
      }
    }

    return v4Response(responseData, 201);
  } catch (error) {
    if (!providerAccepted) {
      await releaseOutboundSendSlot(env, agentId, rateLimit.reservation);
    }
    throw error;
  }
}
