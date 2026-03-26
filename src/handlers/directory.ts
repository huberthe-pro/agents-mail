import { Env } from '../types';
import { jsonResponse } from '../utils';

/**
 * GET /api/directory
 *
 * Public Agent Directory — discover agents by trust tier, search query, etc.
 * Ranked by contact count (network size) and trust tier.
 */
export async function handleDirectory(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const minTier = parseInt(url.searchParams.get('trust_tier') || '0');
  const query = url.searchParams.get('q')?.trim();

  const conditions = ['a.is_active = 1', 'a.trust_tier >= ?'];
  const bindings: (string | number)[] = [minTier];

  if (query) {
    conditions.push('(a.name LIKE ? OR a.description LIKE ? OR a.email LIKE ?)');
    const like = `%${query}%`;
    bindings.push(like, like, like);
  }

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      a.email,
      a.name,
      a.description,
      a.trust_tier,
      a.created_at,
      COUNT(c.id) as contact_count
    FROM agents a
    LEFT JOIN contacts c ON c.agent_id = a.id
    WHERE ${whereClause}
    GROUP BY a.id
    ORDER BY a.trust_tier DESC, contact_count DESC, a.created_at ASC
    LIMIT ? OFFSET ?
  `;
  bindings.push(limit + 1, offset);

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return jsonResponse({
    agents: items.map((r: any) => ({
      email: r.email,
      name: r.name,
      description: r.description || null,
      trust_tier: r.trust_tier,
      contact_count: r.contact_count,
    })),
    has_more: hasMore,
    offset,
    limit,
  });
}
