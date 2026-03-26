import { Env } from '../types';
import { writeEmailEvent } from '../email-events';
import { releaseOutboundSendSlot, reserveOutboundSendSlot } from '../email-rate-limits';
import { generateId, jsonResponse } from '../utils';
import { deliverWebhooks } from './webhooks';
import { authenticateAgent } from '../middleware/auth';
import { validateEmail } from '../middleware/validation';
import { buildPreviewText, normalizeInboundText, sanitizeHtml } from '../mail';
import { upsertContactDirection } from '../contact-graph';
import { maybeUpgradeTier } from '../trust-tiers';
import { encryptEmailFields, decryptEmailFields } from '../encryption';

export async function handleGetEmails(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const url = new URL(request.url);

  // Pagination and filtering params
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
  const cursor = url.searchParams.get('cursor');
  const isRead = url.searchParams.get('is_read');
  const fromFilter = url.searchParams.get('from');
  const since = url.searchParams.get('since');

  // Build query dynamically
  const conditions = ['agent_id = ?'];
  const bindings: (string | number)[] = [agentId];

  if (cursor) {
    // Cursor is the received_at timestamp of the last item
    conditions.push('received_at < ?');
    bindings.push(parseInt(cursor));
  }

  if (isRead !== null && isRead !== undefined && isRead !== '') {
    conditions.push('is_read = ?');
    bindings.push(parseInt(isRead));
  }

  if (fromFilter) {
    conditions.push('from_address = ?');
    bindings.push(fromFilter);
  }

  if (since) {
    conditions.push('received_at >= ?');
    bindings.push(parseInt(since));
  }

  const whereClause = conditions.join(' AND ');
  // Fetch one extra to determine if there are more results
  const query = `
    SELECT id, from_address, from_name, subject, body_text, received_at, is_read, metadata_json,
           is_encrypted, encryption_iv, status
    FROM emails
    WHERE ${whereClause}
    ORDER BY received_at DESC
    LIMIT ?
  `;
  bindings.push(limit + 1);

  const { results } = await DB.prepare(query).bind(...bindings).all();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? String((items[items.length - 1] as any).received_at) : null;

  const emails = await Promise.all(items.map(async (item: any) => {
    const decrypted = await decryptEmailFields(env, item);
    return {
      ...item,
      body_text: decrypted.body_text,
      is_encrypted: undefined,
      encryption_iv: undefined,
      preview_text: buildPreviewText(decrypted.body_text || ''),
      metadata: item.metadata_json ? JSON.parse(item.metadata_json) : null,
    };
  }));

  return jsonResponse({ emails, next_cursor: nextCursor, has_more: hasMore });
}

export async function handleGetEmailDetail(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const emailId = params.emailId;

  const { results } = await DB.prepare(
    `SELECT id, agent_id, from_address, from_name, subject, body_text, body_html, received_at, is_read, metadata_json,
            is_encrypted, encryption_iv, status, receipt_id
     FROM emails WHERE id = ? AND agent_id = ?`
  ).bind(emailId, agentId).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Email not found' }, 404);
  }

  const email = results[0] as any;
  const decrypted = await decryptEmailFields(env, email);
  return jsonResponse({
    ...email,
    body_text: decrypted.body_text,
    body_html: decrypted.body_html,
    is_encrypted: undefined,
    encryption_iv: undefined,
    sanitized_html: decrypted.body_html ? sanitizeHtml(decrypted.body_html) : null,
    preview_text: buildPreviewText(decrypted.body_text || ''),
    metadata: email.metadata_json ? JSON.parse(email.metadata_json) : null,
  });
}

export async function handleSendEmail(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB, RESEND_API_KEY } = env;
  const agentId = params.agentId;
  const { to, subject, content, reply } = await request.json() as any;
  const text = content?.text;
  const sanitizedHtml = content?.html ? sanitizeHtml(content.html) : null;
  const metadata = content?.metadata || null;

  if (!to || !subject || !text) {
    return jsonResponse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing required fields: to, subject, content.text',
      },
    }, 400);
  }

  const emailError = validateEmail(to);
  if (emailError) return emailError;

  // Get agent info
  const { results: agents } = await DB.prepare(
    'SELECT email, name, trust_tier FROM agents WHERE id = ?'
  ).bind(agentId).all();

  if (agents.length === 0) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  const agent = agents[0] as any;

  // Trust tier check: sending requires Tier 1+
  if ((agent.trust_tier ?? 0) < 1) {
    return jsonResponse({
      error: {
        code: 'TIER_RESTRICTED',
        message: 'Sending email requires Trust Tier 1+. Gain mutual contacts or link an owner.',
      },
    }, 403);
  }

  const rateLimit = await reserveOutboundSendSlot(env, agentId);

  if (!rateLimit.allowed) {
    await writeEmailEvent(env, agentId, 'outbound', 'rate_limited', null, {
      limit: rateLimit.limit,
      to,
      subject,
    });
    return jsonResponse({
      error: {
        code: 'RATE_LIMITED',
        message: 'Outbound email rate limit exceeded',
      },
    }, 429);
  }

  let providerAccepted = false;

  try {
    // Append growth signature for Tier 0-1 agents (not stored, delivery-only)
    const addSignature = (agent.trust_tier ?? 0) <= 1;
    const textForSend = addSignature
      ? text + '\n\n---\nSent via Agents Mail - agentsmail.org'
      : text;
    const htmlForSend = sanitizedHtml && addSignature
      ? sanitizedHtml + '<br><hr style="border:none;border-top:1px solid #eee;margin:20px 0"><p style="font-size:12px;color:#999">Sent via <a href="https://agentsmail.org">Agents Mail</a></p>'
      : sanitizedHtml;

    // Send email via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${agent.name} <${agent.email}>`,
        to: [to],
        subject: `🤖 ${subject}`,
        text: textForSend,
        ...(htmlForSend ? { html: htmlForSend } : {}),
        reply_to: reply?.to,
      }),
    });

    providerAccepted = resendResponse.ok;
    const resendData = await resendResponse.json() as any;

    if (!resendResponse.ok) {
      console.error('Resend error:', resendData);
      await releaseOutboundSendSlot(env, agentId, rateLimit.reservation);
      return jsonResponse({ error: 'Failed to send email', details: resendData }, 500);
    }

    // Encrypt and save to DB
    const id = generateId();
    const encrypted = await encryptEmailFields(env, text, sanitizedHtml);
    await DB.prepare(`
      INSERT INTO sent_emails (id, agent_id, to_address, subject, body_text, metadata_json, body_html, resend_id, delivery_status,
                               is_encrypted, encryption_iv, encryption_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      agentId,
      to,
      subject,
      encrypted.body_text,
      metadata ? JSON.stringify(metadata) : null,
      encrypted.body_html,
      resendData.id,
      'sent',
      encrypted.is_encrypted,
      encrypted.encryption_iv,
      encrypted.encryption_version,
    ).run();
    // Update last activity
    DB.prepare('UPDATE agents SET last_activity_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), agentId).run().catch(() => {});

    await writeEmailEvent(env, agentId, 'outbound', 'sent', id, {
      to,
      subject,
      has_html: Boolean(sanitizedHtml),
    });

    // Auto-create/upgrade outbound contact, trigger tier upgrade if mutual
    upsertContactDirection(env, agentId, to, '', 'outbound')
      .then(result => { if (result.upgraded) maybeUpgradeTier(env, agentId).catch(console.error); })
      .catch(err => console.error('Contact graph update failed:', err));

    return jsonResponse({ id, resend_id: resendData.id }, 201);
  } catch (error) {
    if (!providerAccepted) {
      await releaseOutboundSendSlot(env, agentId, rateLimit.reservation);
    }
    throw error;
  }
}

export async function handleMarkRead(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const emailId = params.emailId;
  const { results } = await DB.prepare(
    'SELECT agent_id FROM emails WHERE id = ?'
  ).bind(emailId).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Email not found' }, 404);
  }

  const email = results[0] as any;
  const authError = await authenticateAgent(request, env, email.agent_id);
  if (authError) {
    return authError;
  }

  const now = Math.floor(Date.now() / 1000);
  await DB.prepare(
    "UPDATE emails SET is_read = 1, status = CASE WHEN status = 'unread' THEN 'read' ELSE status END, status_updated_at = CASE WHEN status = 'unread' THEN ? ELSE status_updated_at END WHERE id = ? AND agent_id = ?"
  ).bind(now, emailId, email.agent_id).run();
  return jsonResponse({ ok: true });
}

export async function handleDeleteEmail(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const emailId = params.emailId;

  await DB.prepare(
    'DELETE FROM emails WHERE id = ? AND agent_id = ?'
  ).bind(emailId, agentId).run();

  return jsonResponse({ ok: true });
}

export async function handleBulkDeleteEmails(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const url = new URL(request.url);
  const before = url.searchParams.get('before');

  if (!before) {
    return jsonResponse({ error: 'Query parameter "before" (unix timestamp) is required' }, 400);
  }

  const result = await DB.prepare(
    'DELETE FROM emails WHERE agent_id = ? AND received_at < ?'
  ).bind(agentId, parseInt(before)).run();

  return jsonResponse({ ok: true, deleted: result.meta?.changes || 0 });
}
