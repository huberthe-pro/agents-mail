import { Env } from '../../types';
import { generateId, jsonResponse } from '../../utils';
import { parseDateFilter } from './date-filters';
import { requireAdmin } from './identity';

/**
 * Write an audit log entry. Called internally by other admin handlers.
 */
export async function writeAuditLog(
  env: Env,
  adminEmail: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>,
  actorType: string = 'admin',
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO admin_audit_logs (id, admin_email, action, target_type, target_id, metadata, actor_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      generateId(),
      adminEmail,
      action,
      targetType,
      targetId,
      metadata ? JSON.stringify(metadata) : null,
      actorType,
    )
    .run();
}

/**
 * GET /api/admin/audit
 *
 * Query params: page, limit, action, date_start, date_end
 */
export async function handleAdminAuditLogs(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);
  const action = url.searchParams.get('action');
  const dateStart = url.searchParams.get('date_start');
  const dateEnd = url.searchParams.get('date_end');

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (action) {
    conditions.push('action = ?');
    bindings.push(action);
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

  const countQuery = `SELECT COUNT(*) as total FROM admin_audit_logs ${where}`;
  const countResult = await env.DB.prepare(countQuery).bind(...bindings).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const dataQuery = `
    SELECT id, admin_email, action, target_type, target_id, metadata, created_at
    FROM admin_audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await env.DB.prepare(dataQuery).bind(...bindings, limit, offset).all();

  return jsonResponse({
    logs: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
