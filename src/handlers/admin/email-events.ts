import { Env } from '../../types';
import { jsonResponse, nowUnix } from '../../utils';
import { parseDateFilter } from './date-filters';
import { requireAdmin } from './identity';

/**
 * GET /api/admin/email-events
 *
 * Query params: page, limit, agent_id, direction, event_type, date_start, date_end
 */
export async function handleAdminEmailEvents(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
  const agentId = url.searchParams.get('agent_id');
  const direction = url.searchParams.get('direction');
  const eventType = url.searchParams.get('event_type');
  const dateStart = url.searchParams.get('date_start');
  const dateEnd = url.searchParams.get('date_end');

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (agentId) {
    conditions.push('agent_id = ?');
    bindings.push(agentId);
  }
  if (direction) {
    conditions.push('direction = ?');
    bindings.push(direction);
  }
  if (eventType) {
    conditions.push('event_type = ?');
    bindings.push(eventType);
  }
  const parsedDateStart = parseDateFilter(dateStart, 'start');
  if (parsedDateStart !== null) {
    conditions.push('created_at >= ?');
    bindings.push(parsedDateStart);
  }
  const parsedDateEnd = parseDateFilter(dateEnd, 'end');
  if (parsedDateEnd !== null) {
    conditions.push('created_at <= ?');
    bindings.push(parsedDateEnd);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countQuery = `SELECT COUNT(*) as total FROM email_events ${where}`;
  const countResult = await env.DB.prepare(countQuery).bind(...bindings).all<{ total: number }>();
  const total = Number(countResult.results?.[0]?.total ?? 0);

  const dataQuery = `
    SELECT id, agent_id, email_id, direction, event_type, metadata, created_at
    FROM email_events
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await env.DB.prepare(dataQuery).bind(...bindings, limit, offset).all();

  return jsonResponse({
    events: results,
    pagination: {
      page,
      limit,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  });
}

/**
 * GET /api/admin/email-governance/summary
 */
export async function handleAdminEmailGovernanceSummary(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const since = nowUnix() - 24 * 60 * 60;
  const queryCount = async (eventType: 'received' | 'sent' | 'duplicate' | 'rate_limited') => {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM email_events
      WHERE event_type = ? AND created_at >= ?
    `).bind(eventType, since).all<{ total: number }>();
    return Number(result.results?.[0]?.total ?? 0);
  };

  const [received24h, sent24h, duplicate24h, rateLimited24h, recentEvents, rateLimitedAnomalies, duplicateAnomalies] = await Promise.all([
    queryCount('received'),
    queryCount('sent'),
    queryCount('duplicate'),
    queryCount('rate_limited'),
    env.DB.prepare(`
      SELECT id, agent_id, email_id, direction, event_type, metadata, created_at
      FROM email_events
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(since).all(),
    env.DB.prepare(`
      SELECT agent_id, event_type, COUNT(*) as event_count, MAX(created_at) as latest_at
      FROM email_events
      WHERE event_type = ? AND created_at >= ?
      GROUP BY agent_id
      ORDER BY latest_at DESC
      LIMIT 5
    `).bind('rate_limited', since).all(),
    env.DB.prepare(`
      SELECT agent_id, event_type, COUNT(*) as event_count, MAX(created_at) as latest_at
      FROM email_events
      WHERE event_type = ? AND created_at >= ?
      GROUP BY agent_id
      ORDER BY latest_at DESC
      LIMIT 5
    `).bind('duplicate', since).all(),
  ]);

  return jsonResponse({
    counts: {
      received_24h: received24h,
      sent_24h: sent24h,
      duplicate_24h: duplicate24h,
      rate_limited_24h: rateLimited24h,
    },
    recent_events: recentEvents.results,
    anomalies: [
      ...rateLimitedAnomalies.results,
      ...duplicateAnomalies.results,
    ].sort((left: any, right: any) => Number(right.latest_at || 0) - Number(left.latest_at || 0)),
  });
}
