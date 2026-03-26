import { Env } from '../types';
import { generateId, jsonResponse } from '../utils';

export async function handleListContacts(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { results } = await DB.prepare(
    'SELECT id, name, email, type, tags, direction, created_at FROM contacts WHERE agent_id = ? ORDER BY name ASC'
  ).bind(agentId).all();
  return jsonResponse(results);
}

export async function handleAddContact(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { name, email, type, tags } = await request.json() as any;

  if (!name || !email) {
    return jsonResponse({ error: 'Name and email are required' }, 400);
  }

  const id = generateId();
  await DB.prepare(
    'INSERT OR REPLACE INTO contacts (id, agent_id, name, email, type, tags) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, agentId, name, email, type || 'agent', tags ? JSON.stringify(tags) : null).run();

  return jsonResponse({ id, name, email, type: type || 'agent' }, 201);
}

export async function handleDeleteContact(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const contactId = params.contactId;

  await DB.prepare(
    'DELETE FROM contacts WHERE id = ? AND agent_id = ?'
  ).bind(contactId, agentId).run();

  return jsonResponse({ ok: true });
}

/**
 * DELETE /api/contacts/:email — v0.4 delete contact by email address.
 * Agent resolved from API key by router (params.agentId injected).
 */
export async function handleDeleteContactByEmail(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const email = decodeURIComponent(params.email);

  await DB.prepare(
    'DELETE FROM contacts WHERE agent_id = ? AND email = ?',
  ).bind(agentId, email).run();

  return jsonResponse({ ok: true });
}
