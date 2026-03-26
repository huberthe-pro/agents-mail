import { Env } from '../types';
import { nowUnix } from '../utils';

const INACTIVITY_THRESHOLD = 30 * 24 * 60 * 60; // 30 days
const BATCH_SIZE = 100;

/**
 * Recycle inactive Tier 0 agents:
 * - 30+ days without activity → hard delete agent and all related data
 * - Releases the email address for reuse
 */
export async function handleTier0Recycle(env: Env): Promise<number> {
  const { DB } = env;
  const cutoff = nowUnix() - INACTIVITY_THRESHOLD;

  // Find inactive Tier 0 agents
  const { results: agents } = await DB.prepare(`
    SELECT id FROM agents
    WHERE trust_tier = 0 AND is_active = 1 AND last_activity_at IS NOT NULL AND last_activity_at < ?
    LIMIT ?
  `).bind(cutoff, BATCH_SIZE).all();

  if (agents.length === 0) return 0;

  for (const agent of agents) {
    const id = (agent as any).id;
    // Cascade delete all related data
    await DB.batch([
      DB.prepare('DELETE FROM emails WHERE agent_id = ?').bind(id),
      DB.prepare('DELETE FROM sent_emails WHERE agent_id = ?').bind(id),
      DB.prepare('DELETE FROM acl WHERE agent_id = ?').bind(id),
      DB.prepare('DELETE FROM contacts WHERE agent_id = ?').bind(id),
      DB.prepare('DELETE FROM webhooks WHERE agent_id = ?').bind(id),
      DB.prepare('DELETE FROM agents WHERE id = ?').bind(id),
    ]);
  }

  console.log(`Tier 0 recycle: ${agents.length} agent(s) removed`);
  return agents.length;
}
