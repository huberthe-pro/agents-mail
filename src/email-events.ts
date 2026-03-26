import { Env } from './types';
import { generateId } from './utils';

export async function writeEmailEvent(
  env: Env,
  agentId: string,
  direction: 'inbound' | 'outbound' | 'system',
  eventType: string,
  emailId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO email_events (id, agent_id, email_id, direction, event_type, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      generateId(),
      agentId,
      emailId,
      direction,
      eventType,
      metadata ? JSON.stringify(metadata) : null,
    ).run();
  } catch (error) {
    console.error('Failed to write email event:', {
      agentId,
      direction,
      eventType,
      emailId,
      error,
    });
  }
}
