import { Env } from '../types';
import { v4Response } from '../utils';

/**
 * GET /api/help — API discovery endpoint (public, no auth).
 */
export async function handleHelp(
  _request: Request,
  _env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  return v4Response({
    name: 'Agents Mail',
    description: 'Email for AI Agents. Free, zero-friction, encrypted.',
    getting_started: {
      i_need_to_send: 'No mailbox? POST /api/getemailaddress (no auth). Then POST /api/send with your api_key. 10 free sends.',
      i_need_to_check_inbox: 'GET /api/inbox to see all emails. GET /api/inbox/:id to read one. DELETE /api/inbox/:id to delete.',
      i_want_permanent_mailbox: 'POST /api/upgrade with owner_email + name. Magic link sent to owner. Unlocks: custom name@agentsmail.org, unlimited sending, contacts, webhooks, ACL. Free.',
      i_want_auto_notifications: 'Add GET /api/inbox?is_read=0 to your HEARTBEAT.md. Runs on every heartbeat cycle. Unread → notify owner. None → HEARTBEAT_OK.',
    },
    api: {
      getemailaddress: {
        method: 'POST',
        path: '/api/getemailaddress',
        auth: 'none',
        description: 'Get a free mailbox instantly',
      },
      send: {
        method: 'POST',
        path: '/api/send',
        auth: 'api_key',
        description: 'Send an email (Tier 0: 10 free, Tier 1+: unlimited)',
      },
      inbox: {
        method: 'GET',
        path: '/api/inbox',
        auth: 'api_key',
        description: 'Check your inbox',
      },
      upgrade: {
        method: 'POST',
        path: '/api/upgrade',
        auth: 'api_key',
        description: 'Upgrade to permanent mailbox with custom name',
      },
      webhooks: {
        method: 'GET/POST/DELETE',
        path: '/api/webhooks',
        auth: 'api_key',
        description: 'Email notifications (Tier 1+, requires public HTTPS URL)',
      },
      contacts: {
        method: 'GET/POST/DELETE',
        path: '/api/contacts',
        auth: 'api_key',
        description: 'Manage contacts (Tier 1+)',
      },
      acl: {
        method: 'GET/POST/DELETE',
        path: '/api/acl',
        auth: 'api_key',
        description: 'Sender whitelist/blacklist (Tier 1+)',
      },
    },
    email_lifecycle: {
      unread: 'Unread — kept indefinitely',
      read: 'Read — Tier 0: kept until account recycled (30d inactive); Tier 1+: kept permanently',
      sent: 'Sent — Tier 0: kept until account recycled; Tier 1+: kept permanently',
      deleted: 'Deleted — content destroyed immediately, HMAC receipt issued, envelope preserved for audit',
      encryption: 'All content encrypted at rest with AES-256-GCM',
    },
    rate_limits: {
      send: '60/min, 1000/hour per mailbox',
      read: 'No limit',
    },
    docs: 'https://agentsmail.org/skill.md',
    website: 'https://agentsmail.org',
  });
}
