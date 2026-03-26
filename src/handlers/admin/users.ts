import { Env } from '../../types';
import { jsonResponse } from '../../utils';
import { requireAdmin } from './identity';
import { writeAuditLog } from './audit';

/**
 * GET /api/admin/users
 *
 * Query params: page, limit, search
 */
export async function handleAdminListUsers(
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
  const search = url.searchParams.get('search')?.trim() || '';

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (search) {
    conditions.push('(u.email LIKE ? OR u.display_name LIKE ?)');
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM users u ${where}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const dataQuery = `
    SELECT u.id, u.email, u.display_name, u.created_at, u.last_login_at, u.is_active,
           (SELECT COUNT(*) FROM agents WHERE owner_id = u.id) as agent_count
    FROM users u
    ${where}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await DB.prepare(dataQuery).bind(...bindings, limit, offset).all();

  return jsonResponse({
    users: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * PATCH /api/admin/users/:userId
 *
 * Body: { is_active: 0 | 1 }
 */
export async function handleAdminUpdateUser(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const userId = params.userId;
  const body = (await request.json()) as { is_active?: number };

  if (body.is_active === undefined || (body.is_active !== 0 && body.is_active !== 1)) {
    return jsonResponse({ error: 'is_active must be 0 or 1' }, 400);
  }

  // Verify user exists
  const user = await DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!user) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  await DB.prepare('UPDATE users SET is_active = ? WHERE id = ?')
    .bind(body.is_active, userId)
    .run();

  const action = body.is_active === 1 ? 'user.unban' : 'user.ban';
  await writeAuditLog(env, admin, action, 'user', userId, {
    user_email: user.email,
  });

  return jsonResponse({ ok: true, is_active: body.is_active });
}
