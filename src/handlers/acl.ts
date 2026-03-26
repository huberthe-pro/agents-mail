import { Env } from '../types';
import { generateId, jsonResponse } from '../utils';
import { writeAuditLog } from './admin/audit';

export async function handleListAcl(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { results } = await DB.prepare(
    'SELECT id, email, type, created_at FROM acl WHERE agent_id = ? ORDER BY created_at DESC'
  ).bind(agentId).all();
  return jsonResponse(results);
}

export async function handleAddAcl(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { email, type } = await request.json() as any;

  if (!email) {
    return jsonResponse({ error: 'Email is required' }, 400);
  }

  const id = generateId();
  await DB.prepare(
    'INSERT OR REPLACE INTO acl (id, agent_id, email, type) VALUES (?, ?, ?, ?)'
  ).bind(id, agentId, email, type || 'whitelist').run();

  writeAuditLog(env, agentId, 'acl.add', 'agent', agentId, { email, type: type || 'whitelist' }, 'agent').catch(() => {});

  return jsonResponse({ id, email, type: type || 'whitelist' }, 201);
}

export async function handleDeleteAcl(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const email = params.email;

  const decodedEmail = decodeURIComponent(email);
  await DB.prepare(
    'DELETE FROM acl WHERE agent_id = ? AND email = ?'
  ).bind(agentId, decodedEmail).run();

  writeAuditLog(env, agentId, 'acl.delete', 'agent', agentId, { email: decodedEmail }, 'agent').catch(() => {});

  return jsonResponse({ ok: true });
}
