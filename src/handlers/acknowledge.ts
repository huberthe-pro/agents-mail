import { Env } from '../types';
import { generateId, jsonResponse, nowUnix } from '../utils';

/**
 * POST /api/agents/:agentId/emails/:emailId/acknowledge
 *
 * Agent acknowledges receipt of an email. Content is immediately destroyed.
 * Bearer API Key acts as the agent's digital signature on the receipt.
 *
 * Returns a signed receipt (receipt_id + HMAC signature) and the envelope.
 */
export async function handleAcknowledgeEmail(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const emailId = params.emailId;

  // Fetch email
  const email = await DB.prepare(
    'SELECT id, agent_id, from_address, subject, received_at, status FROM emails WHERE id = ? AND agent_id = ?',
  ).bind(emailId, agentId).first<any>();

  if (!email) {
    return jsonResponse({ error: 'Email not found' }, 404);
  }

  // Cannot re-acknowledge
  if (email.status === 'deleted' || email.status === 'destroyed') {
    return jsonResponse({
      error: { code: 'ALREADY_ACKNOWLEDGED', message: 'This email has already been acknowledged' },
    }, 409);
  }

  const now = nowUnix();
  const receiptId = generateId();

  // Build HMAC signature over receipt data
  const signaturePayload = `${receiptId}:${emailId}:${agentId}:${now}`;
  let signature = '';

  if (env.RECEIPT_HMAC_KEY) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.RECEIPT_HMAC_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signaturePayload));
    signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Destroy content + update status
  await DB.prepare(`
    UPDATE emails SET
      body_text = NULL, body_html = NULL,
      encryption_iv = NULL, is_encrypted = 0,
      status = 'deleted', status_updated_at = ?,
      content_destroyed_at = ?,
      receipt_id = ?, receipt_signature = ?
    WHERE id = ?
  `).bind(now, now, receiptId, signature, emailId).run();

  return jsonResponse({
    receipt_id: receiptId,
    email_id: emailId,
    acknowledged_at: now,
    signature,
    envelope: {
      from: email.from_address,
      subject: email.subject,
      received_at: email.received_at,
    },
  });
}
