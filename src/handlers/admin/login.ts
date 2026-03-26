import { Env } from '../../types';
import { jsonResponse } from '../../utils';
import { hashApiKey } from '../../middleware/auth';

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a JWT with HMAC-SHA256 using Web Crypto API.
 */
async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = toBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const sigB64url = toBase64Url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64url}`;
}

// Simple in-memory rate limiting (resets on worker restart)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * POST /api/admin/login
 *
 * Body: { password: string }
 * Returns: { token: string } on success
 */
export async function handleAdminLogin(
  request: Request,
  env: Env,
  _params: Record<string, string>,
): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  // Rate limiting: 5 attempts per minute per IP
  const entry = loginAttempts.get(ip);
  if (entry) {
    if (now < entry.resetAt) {
      if (entry.count >= 5) {
        return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429, request);
      }
      entry.count++;
    } else {
      entry.count = 1;
      entry.resetAt = now + 60_000;
    }
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!body.password) {
    return jsonResponse({ error: 'Password is required' }, 400, request);
  }

  const inputHash = await hashApiKey(body.password);
  const expectedHash = await hashApiKey(env.ADMIN_PASSWORD);
  if (inputHash !== expectedHash) {
    return jsonResponse({ error: 'Invalid password' }, 401, request);
  }

  // Clear rate limit on success
  loginAttempts.delete(ip);

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 24 * 60 * 60; // 24 hours

  const token = await signJwt(
    { sub: 'admin', email: 'admin@agentsmail.org', iat, exp },
    env.JWT_SECRET,
  );

  return jsonResponse({ token }, 200, request);
}
