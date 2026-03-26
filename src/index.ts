/**
 * Agents Mail - Cloudflare Worker
 * API for agent email service
 */

export type { Env } from './types';

import { Env } from './types';
import { getCorsHeaders } from './utils';
import { routeRequest } from './router';
import { buildAppUrl, resolveAdminAppBaseUrl } from './app-origins';
import { handleAutoDestroy } from './cron/auto-destroy';
import { handleTier0Recycle } from './cron/tier0-recycle';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve admin frontend from same domain — proxy to Cloudflare Pages
    if (url.pathname === '/admin') {
      return Response.redirect(`${url.origin}/admin/`, 301);
    }
    if (url.pathname.startsWith('/admin/')) {
      const pagesPath = url.pathname.replace('/admin', '');
      const pagesUrl = buildAppUrl(resolveAdminAppBaseUrl(env), pagesPath, Object.fromEntries(url.searchParams.entries()));
      const pagesRes = await fetch(pagesUrl);
      // Return with original headers, remove any restrictive framing
      const res = new Response(pagesRes.body, pagesRes);
      res.headers.delete('x-frame-options');
      return res;
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: getCorsHeaders(request) });
    }

    return routeRequest(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleAutoDestroy(env);
    await handleTier0Recycle(env);
  },
};
