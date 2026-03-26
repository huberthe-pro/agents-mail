import { Env } from '../types';
import { jsonResponse, batchVal } from '../utils';
import { getUserFromRequest } from '../middleware/jwt';

/**
 * GET /api/stats
 *
 * Authenticated user-level aggregate statistics.
 * Returns counts scoped to agents owned by the JWT user.
 */
export async function handleUserStats(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  const { DB } = env;

  const stmts = [
    DB.prepare(
      'SELECT COUNT(*) as total FROM agents WHERE owner_id = ?'
    ).bind(user.userId),
    DB.prepare(
      `SELECT COUNT(*) as total FROM emails WHERE agent_id IN (SELECT id FROM agents WHERE owner_id = ?)`
    ).bind(user.userId),
    DB.prepare(
      `SELECT COUNT(*) as total FROM emails WHERE agent_id IN (SELECT id FROM agents WHERE owner_id = ?) AND is_read = 0`
    ).bind(user.userId),
    DB.prepare(
      `SELECT COUNT(*) as total FROM sent_emails WHERE agent_id IN (SELECT id FROM agents WHERE owner_id = ?)`
    ).bind(user.userId),
  ];

  const r = await DB.batch(stmts);

  return jsonResponse({
    total_agents: batchVal(r, 0),
    total_emails: batchVal(r, 1),
    unread_emails: batchVal(r, 2),
    sent_emails: batchVal(r, 3),
  });
}
