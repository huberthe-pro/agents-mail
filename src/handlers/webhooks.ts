import { Env } from '../types';
import { generateId, jsonResponse, nowUnix } from '../utils';

export async function handleListWebhooks(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { results } = await DB.prepare(
    'SELECT id, url, events, is_active, created_at FROM webhooks WHERE agent_id = ? ORDER BY created_at DESC'
  ).bind(agentId).all();
  return jsonResponse(results);
}

export async function handleAddWebhook(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const { url, events } = await request.json() as any;

  if (!url) {
    return jsonResponse({ error: 'URL is required' }, 400);
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return jsonResponse({ error: 'Invalid URL format' }, 400);
  }

  const id = generateId();
  // Generate a random secret for webhook signature
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const eventList = events || ['email.received'];

  await DB.prepare(
    'INSERT INTO webhooks (id, agent_id, url, secret, events) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, agentId, url, secret, JSON.stringify(eventList)).run();

  return jsonResponse({ id, url, secret, events: eventList }, 201);
}

export async function handleDeleteWebhook(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const webhookId = params.webhookId;

  await DB.prepare(
    'DELETE FROM webhooks WHERE id = ? AND agent_id = ?'
  ).bind(webhookId, agentId).run();

  return jsonResponse({ ok: true });
}

/**
 * Deliver webhook notifications for an event.
 * Fire-and-forget — does not block the inbound email flow.
 */
export async function deliverWebhooks(
  env: Env,
  agentId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { DB } = env;

  const { results: webhooks } = await DB.prepare(
    'SELECT id, url, secret FROM webhooks WHERE agent_id = ? AND is_active = 1'
  ).bind(agentId).all();

  for (const webhook of webhooks as any[]) {
    try {
      const timestamp = nowUnix();
      const body = JSON.stringify({ event, ...payload, timestamp });

      // Create HMAC-SHA256 signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhook.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': sigHex,
          'X-Webhook-Timestamp': String(timestamp),
          'X-Webhook-Id': webhook.id,
        },
        body,
      });
    } catch (error) {
      console.error(`Webhook delivery failed for ${webhook.id}:`, error);
    }
  }
}
