import { Env } from '../types';
import { jsonResponse } from '../utils';
import { buildPreviewText } from '../mail';
import { decryptEmailFields } from '../encryption';

export async function handleGetSentEmails(
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
  const toFilter = url.searchParams.get('to');
  const since = url.searchParams.get('since');

  // Build query dynamically
  const conditions = ['agent_id = ?'];
  const bindings: (string | number)[] = [agentId];

  if (cursor) {
    // Cursor is the sent_at timestamp of the last item
    conditions.push('sent_at < ?');
    bindings.push(parseInt(cursor));
  }

  if (toFilter) {
    conditions.push('to_address = ?');
    bindings.push(toFilter);
  }

  if (since) {
    conditions.push('sent_at >= ?');
    bindings.push(parseInt(since));
  }

  const whereClause = conditions.join(' AND ');
  // Fetch one extra to determine if there are more results
  const query = `
    SELECT id, to_address, subject, body_text, sent_at, metadata_json, delivery_status, resend_id,
           is_encrypted, encryption_iv
    FROM sent_emails
    WHERE ${whereClause}
    ORDER BY sent_at DESC
    LIMIT ?
  `;
  bindings.push(limit + 1);

  const { results } = await DB.prepare(query).bind(...bindings).all();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? String((items[items.length - 1] as any).sent_at) : null;

  const emails = await Promise.all(items.map(async (item: any) => {
    const decrypted = await decryptEmailFields(env, item);
    return {
      ...item,
      body_text: decrypted.body_text,
      is_encrypted: undefined,
      encryption_iv: undefined,
      preview_text: buildPreviewText(decrypted.body_text || ''),
      metadata: item.metadata_json ? JSON.parse(item.metadata_json) : null,
      metadata_json: undefined,
    };
  }));

  return jsonResponse({ emails, next_cursor: nextCursor, has_more: hasMore });
}

/**
 * DELETE /api/sent/:emailId — v0.4 delete a sent email.
 * Agent resolved from API key by router (params.agentId injected).
 */
export async function handleDeleteSentEmail(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const emailId = params.emailId;

  await DB.prepare(
    'DELETE FROM sent_emails WHERE id = ? AND agent_id = ?',
  ).bind(emailId, agentId).run();

  return jsonResponse({ ok: true });
}
