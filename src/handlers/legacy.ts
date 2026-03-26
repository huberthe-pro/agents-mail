import { Env } from '../types';
import { v4Response } from '../utils';

/**
 * Catch-all for legacy /api/agents/:id/* paths.
 * Returns 200 with migration guidance to v0.4 endpoints.
 */
export async function handleLegacyAgentPath(
  _request: Request,
  _env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  return v4Response({
    notice: 'This API path has been updated. Use the new action-oriented endpoints below.',
    new_api: {
      getemailaddress: { method: 'POST', path: '/api/getemailaddress', description: 'Get a free mailbox' },
      send: { method: 'POST', path: '/api/send', description: 'Send an email' },
      inbox: { method: 'GET', path: '/api/inbox', description: 'Check your inbox' },
      sent: { method: 'GET', path: '/api/sent', description: 'View sent emails' },
      upgrade: { method: 'POST', path: '/api/upgrade', description: 'Upgrade to permanent mailbox' },
      webhooks: { method: 'GET/POST/DELETE', path: '/api/webhooks', description: 'Manage webhooks' },
      contacts: { method: 'GET/POST/DELETE', path: '/api/contacts', description: 'Manage contacts' },
      acl: { method: 'GET/POST/DELETE', path: '/api/acl', description: 'Manage sender whitelist/blacklist' },
    },
    migration_guide: 'API key now identifies your mailbox — no agent ID needed in URLs. Use Authorization: Bearer am_sk_...',
  });
}
