import { Env } from './types';
import { getCorsHeaders, jsonResponse } from './utils';
import { authenticateAgent, resolveAgentFromAuth } from './middleware/auth';
import { handleHealthCheck, handleServiceDiscovery } from './handlers/discovery';
import { handlePublicStats } from './handlers/public-stats';
import { handleUserStats } from './handlers/user-stats';
import { handleCreateAgent, handleListAgents, handleGetAgent, handleDeleteAgent, handleBindAgentName } from './handlers/agents';
import { handleGetEmails, handleGetEmailDetail, handleSendEmail, handleMarkRead, handleDeleteEmail, handleBulkDeleteEmails } from './handlers/emails';
import { handleGetSentEmails, handleDeleteSentEmail } from './handlers/sent-emails';
import { handleDirectory } from './handlers/directory';
import { handleHelp } from './handlers/help';
import { handleListAcl, handleAddAcl, handleDeleteAcl } from './handlers/acl';
import { handleListContacts, handleAddContact, handleDeleteContact, handleDeleteContactByEmail } from './handlers/contacts';
import { handleInterpretEmail } from './handlers/interpreter';
import { handleListWebhooks, handleAddWebhook, handleDeleteWebhook } from './handlers/webhooks';
import { handleSendMagicLink, handleVerifyMagicLink, handleLogout, handleGetMe } from './handlers/auth';
import { handleClaimAgent, handleConfirmClaim, handleRemoveOwner } from './handlers/owner';
import { handleRegenerateKey } from './handlers/regenerate-key';
import { handleAdminStats } from './handlers/admin/stats';
import { handleAdminListAgents, handleAdminUpdateAgent, handleAdminDeleteAgent } from './handlers/admin/agents';
import { handleAdminListUsers, handleAdminUpdateUser } from './handlers/admin/users';
import { handleAdminListEmails, handleAdminEmailAnomalies } from './handlers/admin/emails';
import { handleAdminAuditLogs } from './handlers/admin/audit';
import { handleAdminEmailEvents, handleAdminEmailGovernanceSummary } from './handlers/admin/email-events';
import { handleAcknowledgeEmail } from './handlers/acknowledge';
import { handleAdminLogin } from './handlers/admin/login';
import { handleGetEmailAddress } from './handlers/register';
import { handleSendV4 } from './handlers/send-v4';
import { handleUpgrade } from './handlers/upgrade';
import { handleLegacyAgentPath } from './handlers/legacy';

type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  paramNames: string[];
  requiresAuth: boolean;
  authMode?: 'v4'; // v0.4: resolve agent from API key, inject agentId into params
}

const routes: Route[] = [
  // ─── Public routes ───
  {
    method: 'GET',
    pattern: /^\/$/,
    handler: handleHealthCheck,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/\.well-known\/(service|agents-mail|agent-mailbox)$/,
    handler: handleServiceDiscovery,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/help$/,
    handler: handleHelp,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/public\/stats$/,
    handler: handlePublicStats,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/directory$/,
    handler: handleDirectory,
    paramNames: [],
    requiresAuth: false,
  },

  // ─── v0.4 Action-Oriented Routes ───
  {
    method: 'POST',
    pattern: /^\/api\/getemailaddress$/,
    handler: handleGetEmailAddress,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'POST',
    pattern: /^\/api\/send$/,
    handler: handleSendV4,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'GET',
    pattern: /^\/api\/inbox$/,
    handler: handleGetEmails,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'GET',
    pattern: /^\/api\/inbox\/([\w-]+)$/,
    handler: handleGetEmailDetail,
    paramNames: ['emailId'],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/inbox\/([\w-]+)$/,
    handler: handleDeleteEmail,
    paramNames: ['emailId'],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'GET',
    pattern: /^\/api\/sent$/,
    handler: handleGetSentEmails,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/sent\/([\w-]+)$/,
    handler: handleDeleteSentEmail,
    paramNames: ['emailId'],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'POST',
    pattern: /^\/api\/upgrade$/,
    handler: handleUpgrade,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  // Webhooks (v0.4)
  {
    method: 'GET',
    pattern: /^\/api\/webhooks$/,
    handler: handleListWebhooks,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'POST',
    pattern: /^\/api\/webhooks$/,
    handler: handleAddWebhook,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/webhooks\/([\w-]+)$/,
    handler: handleDeleteWebhook,
    paramNames: ['webhookId'],
    requiresAuth: false,
    authMode: 'v4',
  },
  // Contacts (v0.4)
  {
    method: 'GET',
    pattern: /^\/api\/contacts$/,
    handler: handleListContacts,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'POST',
    pattern: /^\/api\/contacts$/,
    handler: handleAddContact,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/contacts\/([\w\-@.]+)$/,
    handler: handleDeleteContactByEmail,
    paramNames: ['email'],
    requiresAuth: false,
    authMode: 'v4',
  },
  // ACL (v0.4)
  {
    method: 'GET',
    pattern: /^\/api\/acl$/,
    handler: handleListAcl,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'POST',
    pattern: /^\/api\/acl$/,
    handler: handleAddAcl,
    paramNames: [],
    requiresAuth: false,
    authMode: 'v4',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/acl\/([\w\-@.]+)$/,
    handler: handleDeleteAcl,
    paramNames: ['email'],
    requiresAuth: false,
    authMode: 'v4',
  },

  // ─── Legacy v0.3 routes (still functional) ───
  {
    method: 'POST',
    pattern: /^\/api\/agents$/,
    handler: handleCreateAgent,
    paramNames: [],
    requiresAuth: false,
  },
  // Auth routes (human login — Magic Link)
  {
    method: 'POST',
    pattern: /^\/api\/auth\/magic-link$/,
    handler: handleSendMagicLink,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/verify$/,
    handler: handleVerifyMagicLink,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    handler: handleLogout,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/me$/,
    handler: handleGetMe,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/claim\/confirm$/,
    handler: handleConfirmClaim,
    paramNames: [],
    requiresAuth: false,
  },
  // User-level stats (JWT only)
  {
    method: 'GET',
    pattern: /^\/api\/stats$/,
    handler: handleUserStats,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/user\/stats$/,
    handler: handleUserStats,
    paramNames: [],
    requiresAuth: false,
  },
  // Agent listing (requires auth — JWT or API Key)
  {
    method: 'GET',
    pattern: /^\/api\/agents$/,
    handler: handleListAgents,
    paramNames: [],
    requiresAuth: false,
  },
  // Agent claim (human claims agent with API Key)
  {
    method: 'POST',
    pattern: /^\/api\/agents\/claim$/,
    handler: handleClaimAgent,
    paramNames: [],
    requiresAuth: false,
  },
  // Bind agent name (requires Trust Tier 1+)
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/name$/,
    handler: handleBindAgentName,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  // Regenerate API key (JWT owner only)
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/regenerate-key$/,
    handler: handleRegenerateKey,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  // Authenticated agent routes (API Key or JWT owner)
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)$/,
    handler: handleGetAgent,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)$/,
    handler: handleDeleteAgent,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/owner$/,
    handler: handleRemoveOwner,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/emails$/,
    handler: handleGetEmails,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/sent$/,
    handler: handleGetSentEmails,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/emails\/([\w-]+)$/,
    handler: handleGetEmailDetail,
    paramNames: ['agentId', 'emailId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/emails$/,
    handler: handleSendEmail,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/emails\/([\w-]+)$/,
    handler: handleDeleteEmail,
    paramNames: ['agentId', 'emailId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/emails$/,
    handler: handleBulkDeleteEmails,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'PUT',
    pattern: /^\/api\/emails\/([\w-]+)\/read$/,
    handler: handleMarkRead,
    paramNames: ['emailId'],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/acl$/,
    handler: handleListAcl,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/acl$/,
    handler: handleAddAcl,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/acl\/([\w\-@.]+)$/,
    handler: handleDeleteAcl,
    paramNames: ['agentId', 'email'],
    requiresAuth: true,
  },
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/contacts$/,
    handler: handleListContacts,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/contacts$/,
    handler: handleAddContact,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/contacts\/([\w-]+)$/,
    handler: handleDeleteContact,
    paramNames: ['agentId', 'contactId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/emails\/([\w-]+)\/interpret$/,
    handler: handleInterpretEmail,
    paramNames: ['agentId', 'emailId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/emails\/([\w-]+)\/acknowledge$/,
    handler: handleAcknowledgeEmail,
    paramNames: ['agentId', 'emailId'],
    requiresAuth: true,
  },
  // Webhooks (legacy)
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/webhooks$/,
    handler: handleListWebhooks,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/webhooks$/,
    handler: handleAddWebhook,
    paramNames: ['agentId'],
    requiresAuth: true,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/webhooks\/([\w-]+)$/,
    handler: handleDeleteWebhook,
    paramNames: ['agentId', 'webhookId'],
    requiresAuth: true,
  },
  // Admin auth
  {
    method: 'POST',
    pattern: /^\/api\/admin\/login$/,
    handler: handleAdminLogin,
    paramNames: [],
    requiresAuth: false,
  },
  // Admin routes (protected by Bearer JWT)
  {
    method: 'GET',
    pattern: /^\/api\/admin\/stats$/,
    handler: handleAdminStats,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/agents$/,
    handler: handleAdminListAgents,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/admin\/agents\/([\w-]+)$/,
    handler: handleAdminUpdateAgent,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/agents\/([\w-]+)$/,
    handler: handleAdminDeleteAgent,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/users$/,
    handler: handleAdminListUsers,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/admin\/users\/([\w-]+)$/,
    handler: handleAdminUpdateUser,
    paramNames: ['userId'],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/emails$/,
    handler: handleAdminListEmails,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/emails\/anomalies$/,
    handler: handleAdminEmailAnomalies,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/audit$/,
    handler: handleAdminAuditLogs,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/email-events$/,
    handler: handleAdminEmailEvents,
    paramNames: [],
    requiresAuth: false,
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/email-governance\/summary$/,
    handler: handleAdminEmailGovernanceSummary,
    paramNames: [],
    requiresAuth: false,
  },
  // ─── Legacy catch-all (must be LAST) ───
  {
    method: 'GET',
    pattern: /^\/api\/agents\/([\w-]+)\/.+$/,
    handler: handleLegacyAgentPath,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'POST',
    pattern: /^\/api\/agents\/([\w-]+)\/.+$/,
    handler: handleLegacyAgentPath,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'PUT',
    pattern: /^\/api\/agents\/([\w-]+)\/.+$/,
    handler: handleLegacyAgentPath,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/agents\/([\w-]+)\/.+$/,
    handler: handleLegacyAgentPath,
    paramNames: ['agentId'],
    requiresAuth: false,
  },
];

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(request);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    for (const route of routes) {
      if (route.method !== method) continue;

      const match = path.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });

      // v0.4 auth: resolve agent from API key, inject agentId
      if (route.authMode === 'v4') {
        const result = await resolveAgentFromAuth(request, env);
        if (result instanceof Response) return withCors(result, request);
        params.agentId = result.agent.id;
      }

      // Enforce authentication on protected routes
      if (route.requiresAuth && params.agentId) {
        const authError = await authenticateAgent(request, env, params.agentId);
        if (authError) return withCors(authError, request);
      }

      const response = await route.handler(request, env, params);
      return withCors(response, request);
    }

    return withCors(jsonResponse({ error: 'Not found' }, 404), request);
  } catch (error) {
    console.error('Error:', error);
    return withCors(jsonResponse({ error: 'Internal server error' }, 500), request);
  }
}
