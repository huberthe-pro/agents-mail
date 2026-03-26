import { Env } from '../../types';
import { jsonResponse } from '../../utils';
import { requireAdmin } from './identity';
import { writeAuditLog } from './audit';

/**
 * GET /api/admin/agents
 *
 * Query params: page, limit, search, status (active | inactive)
 */
export async function handleAdminListAgents(
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
  const status = url.searchParams.get('status'); // "active" | "inactive"

  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (search) {
    conditions.push('(a.name LIKE ? OR a.email LIKE ?)');
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  if (status === 'active') {
    conditions.push('a.is_active = 1');
  } else if (status === 'inactive') {
    conditions.push('a.is_active = 0');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await DB.prepare(
    `SELECT COUNT(*) as total FROM agents a ${where}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const dataQuery = `
    SELECT a.id, a.email, a.name, a.created_at, a.is_active, a.owner_id,
           u.email as owner_email
    FROM agents a
    LEFT JOIN users u ON a.owner_id = u.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const { results } = await DB.prepare(dataQuery).bind(...bindings, limit, offset).all();

  return jsonResponse({
    agents: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * PATCH /api/admin/agents/:agentId
 *
 * Body: { is_active: 0 | 1 }
 */
export async function handleAdminUpdateAgent(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const agentId = params.agentId;
  const body = (await request.json()) as { is_active?: number };

  if (body.is_active === undefined || (body.is_active !== 0 && body.is_active !== 1)) {
    return jsonResponse({ error: 'is_active must be 0 or 1' }, 400);
  }

  // Verify agent exists
  const agent = await DB.prepare('SELECT id, name FROM agents WHERE id = ?')
    .bind(agentId)
    .first<{ id: string; name: string }>();
  if (!agent) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  await DB.prepare('UPDATE agents SET is_active = ?, updated_at = unixepoch() WHERE id = ?')
    .bind(body.is_active, agentId)
    .run();

  await writeAuditLog(env, admin, 'agent.update', 'agent', agentId, {
    is_active: body.is_active,
    agent_name: agent.name,
  });

  return jsonResponse({ ok: true, is_active: body.is_active });
}

/**
 * DELETE /api/admin/agents/:agentId
 *
 * Hard-deletes agent and cascades to emails, acl, contacts, webhooks.
 */
export async function handleAdminDeleteAgent(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const { DB } = env;
  const agentId = params.agentId;

  // Verify agent exists
  const agent = await DB.prepare('SELECT id, name, email FROM agents WHERE id = ?')
    .bind(agentId)
    .first<{ id: string; name: string; email: string }>();
  if (!agent) {
    return jsonResponse({ error: 'Agent not found' }, 404);
  }

  // Cascade delete via batch
  await DB.batch([
    DB.prepare('DELETE FROM emails WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM sent_emails WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM acl WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM contacts WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM webhooks WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM agent_owner_claims WHERE agent_id = ?').bind(agentId),
    DB.prepare('DELETE FROM agents WHERE id = ?').bind(agentId),
  ]);

  await writeAuditLog(env, admin, 'agent.delete', 'agent', agentId, {
    agent_name: agent.name,
    agent_email: agent.email,
  });

  return jsonResponse({ ok: true, message: 'Agent and all associated data deleted' });
}
