import { Env } from '../../types';
import { jsonResponse, nowUnix } from '../../utils';
import { parseDateFilter } from './date-filters';
import { requireAdmin } from './identity';

/**
 * GET /api/admin/emails
 *
 * Query params: page, limit, agent_id, from, date_start, date_end
 */
export async function handleAdminListEmails(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
  const agentId = url.searchParams.get('agent_id');
  const from = url.searchParams.get('from');
  const dateStart = url.searchParams.get('date_start');
  const dateEnd = url.searchParams.get('date_end');

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (agentId) {
    conditions.push('e.agent_id = ?');
    bindings.push(agentId);
  }
  if (from) {
    conditions.push('e.from_address LIKE ?');
    bindings.push(`%${from}%`);
  }
  const parsedDateStart = parseDateFilter(dateStart, 'start');
  if (parsedDateStart !== null) {
    conditions.push('e.received_at >= ?');
    bindings.push(parsedDateStart);
  }
  const parsedDateEnd = parseDateFilter(dateEnd, 'end');
  if (parsedDateEnd !== null) {
    conditions.push('e.received_at <= ?');
    bindings.push(parsedDateEnd);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM emails e ${where}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const dataQuery = `
    SELECT e.id, e.agent_id, e.from_address, e.from_name, e.subject,
           e.received_at, e.is_read,
           a.name as agent_name, a.email as agent_email
    FROM emails e
    LEFT JOIN agents a ON e.agent_id = a.id
    ${where}
    ORDER BY e.received_at DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await DB.prepare(dataQuery).bind(...bindings, limit, offset).all();

  return jsonResponse({
    emails: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * GET /api/admin/emails/anomalies
 *
 * Returns agents that sent more than 100 emails in the last 24 hours.
 */
export async function handleAdminEmailAnomalies(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const oneDayAgo = nowUnix() - 24 * 60 * 60;

  const { results } = await DB.prepare(`
    SELECT s.agent_id, a.name as agent_name, a.email as agent_email,
           COUNT(*) as sent_count
    FROM sent_emails s
    JOIN agents a ON s.agent_id = a.id
    WHERE s.sent_at >= ?
    GROUP BY s.agent_id
    HAVING COUNT(*) > 100
    ORDER BY sent_count DESC
  `).bind(oneDayAgo).all();

  return jsonResponse({ anomalies: results });
}
