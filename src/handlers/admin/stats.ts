import { Env } from '../../types';
import { jsonResponse, nowUnix, batchVal } from '../../utils';
import { requireAdmin } from './identity';

/**
 * GET /api/admin/stats
 *
 * Platform-wide statistics for the admin dashboard.
 */
export async function handleAdminStats(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const now = nowUnix();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;
  const oneDayAgo = now - 24 * 60 * 60;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

  // Run all stat queries in parallel via D1 batch
  const stmts = [
    DB.prepare('SELECT COUNT(*) as total FROM agents'),
    DB.prepare('SELECT COUNT(*) as active FROM agents WHERE is_active = 1'),
    DB.prepare('SELECT COUNT(*) as new_7d FROM agents WHERE created_at >= ?').bind(sevenDaysAgo),
    DB.prepare('SELECT COUNT(*) as new_today FROM agents WHERE created_at >= ?').bind(todayStartUnix),
    DB.prepare('SELECT COUNT(*) as total FROM users'),
    DB.prepare('SELECT COUNT(*) as active FROM users WHERE is_active = 1'),
    DB.prepare('SELECT COUNT(*) as new_7d FROM users WHERE created_at >= ?').bind(sevenDaysAgo),
    DB.prepare('SELECT COUNT(*) as new_today FROM users WHERE created_at >= ?').bind(todayStartUnix),
    DB.prepare('SELECT COUNT(*) as received_total FROM emails'),
    DB.prepare('SELECT COUNT(*) as sent_total FROM sent_emails'),
    DB.prepare('SELECT COUNT(*) as received_24h FROM emails WHERE received_at >= ?').bind(oneDayAgo),
    DB.prepare('SELECT COUNT(*) as sent_24h FROM sent_emails WHERE sent_at >= ?').bind(oneDayAgo),
  ];

  const r = await DB.batch(stmts);

  return jsonResponse({
    agents: {
      total: batchVal(r, 0, 'total'),
      active: batchVal(r, 1, 'active'),
      new_7d: batchVal(r, 2, 'new_7d'),
      new_today: batchVal(r, 3, 'new_today'),
    },
    users: {
      total: batchVal(r, 4, 'total'),
      active: batchVal(r, 5, 'active'),
      new_7d: batchVal(r, 6, 'new_7d'),
      new_today: batchVal(r, 7, 'new_today'),
    },
    emails: {
      received_total: batchVal(r, 8, 'received_total'),
      sent_total: batchVal(r, 9, 'sent_total'),
      received_24h: batchVal(r, 10, 'received_24h'),
      sent_24h: batchVal(r, 11, 'sent_24h'),
    },
  });
}
