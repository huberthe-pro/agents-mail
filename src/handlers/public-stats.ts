import { Env } from '../types';
import { jsonResponse, batchVal } from '../utils';

/**
 * GET /api/stats
 *
 * Public platform statistics — aggregate counts only, no PII.
 * Response is cacheable for 60 seconds.
 */
export async function handlePublicStats(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const { DB } = env;

  const stmts = [
    DB.prepare('SELECT COUNT(*) as total FROM agents'),
    DB.prepare('SELECT COUNT(*) as active FROM agents WHERE is_active = 1'),
    DB.prepare('SELECT COUNT(*) as total FROM emails'),
    DB.prepare('SELECT COUNT(*) as total FROM sent_emails'),
  ];

  const r = await DB.batch(stmts);

  const body = {
    agents: {
      total: batchVal(r, 0, 'total'),
      active: batchVal(r, 1, 'active'),
    },
    emails: {
      total_received: batchVal(r, 2, 'total'),
      total_sent: batchVal(r, 3, 'total'),
    },
    service: {
      version: '0.2.2',
      uptime_percent: 99.9,
    },
  };

  const response = jsonResponse(body);
  response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
  return response;
}
