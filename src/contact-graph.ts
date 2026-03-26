import { Env } from './types';
import { generateId } from './utils';

type ContactDirection = 'manual' | 'outbound' | 'inbound' | 'mutual';

/**
 * Upsert a contact based on email direction.
 * If contact exists with opposite direction, upgrade to 'mutual'.
 */
export async function upsertContactDirection(
  env: Env,
  agentId: string,
  contactEmail: string,
  contactName: string,
  newDirection: 'inbound' | 'outbound',
): Promise<{ direction: ContactDirection; upgraded: boolean }> {
  const { DB } = env;

  const existing = await DB.prepare(
    'SELECT id, direction FROM contacts WHERE agent_id = ? AND email = ?'
  ).bind(agentId, contactEmail).first<{ id: string; direction: ContactDirection }>();

  if (!existing) {
    // New contact
    const id = generateId();
    await DB.prepare(
      'INSERT INTO contacts (id, agent_id, name, email, type, direction) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, agentId, contactName || contactEmail, contactEmail, 'agent', newDirection).run();
    return { direction: newDirection, upgraded: false };
  }

  if (existing.direction === 'mutual') {
    // Already mutual, no-op
    return { direction: 'mutual', upgraded: false };
  }

  if (existing.direction === newDirection) {
    // Same direction, no-op
    return { direction: newDirection, upgraded: false };
  }

  // Determine new direction
  const opposites: Record<string, ContactDirection> = {
    'inbound:outbound': 'mutual',
    'outbound:inbound': 'mutual',
  };

  const key = `${existing.direction}:${newDirection}`;
  const upgradedDirection = opposites[key] || newDirection;

  await DB.prepare(
    'UPDATE contacts SET direction = ? WHERE id = ? AND agent_id = ?'
  ).bind(upgradedDirection, existing.id, agentId).run();

  return { direction: upgradedDirection, upgraded: upgradedDirection === 'mutual' };
}

/**
 * Count mutual contacts for an agent (used by trust tier calculation).
 */
export async function countMutualContacts(
  env: Env,
  agentId: string,
): Promise<number> {
  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM contacts WHERE agent_id = ? AND direction = ?'
  ).bind(agentId, 'mutual').first<{ count: number }>();
  return result?.count ?? 0;
}
