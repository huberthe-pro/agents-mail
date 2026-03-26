import { isLocalDevelopmentOrigin } from './app-origins';

const ALLOWED_ORIGINS = [
  'https://agent-mailbox-admin.pages.dev',
  'https://agents-mail-admin.pages.dev',
  'https://admin.agentsmail.org',
  'https://agents-mail-admin.vercel.app',
  'https://web-rho-sand-88.vercel.app',
  'https://agentsmail.org',
  'http://localhost:3000',
];

export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) || isLocalDevelopmentOrigin(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion, X-Admin-Jwt',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export const generateId = () => crypto.randomUUID();

export function jsonResponse(data: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
  });
}

/** Current Unix timestamp in seconds. */
export const nowUnix = () => Math.floor(Date.now() / 1000);

/** Extract a numeric value from a D1 batch result by index and column key. */
export function batchVal(results: any[], idx: number, key = 'total'): number {
  const row = results[idx]?.results?.[0] as Record<string, unknown> | undefined;
  return (row?.[key] as number) ?? 0;
}

const HELP_URL = 'https://agentsmail.org/api/help';

/** v0.4 success response — auto-attaches `help` field. */
export function v4Response(data: Record<string, unknown>, status = 200, request?: Request): Response {
  return jsonResponse({ ...data, help: HELP_URL }, status, request);
}

/** v0.4 error response — structured { error: { code, message }, help }. */
export function v4Error(code: string, message: string, status: number, extra?: Record<string, unknown>, request?: Request): Response {
  return jsonResponse({
    error: { code, message, ...extra },
    help: HELP_URL,
  }, status, request);
}

/** Trial send limit for Tier 0 mailboxes. */
export const TRIAL_SEND_LIMIT = 10;
