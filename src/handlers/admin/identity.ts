import { Env } from '../../types';

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4);
  return atob(padded);
}

/**
 * Verify a JWT signed with HMAC-SHA256.
 * Returns the decoded payload or null if invalid/expired.
 */
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Reconstruct signature from base64url
    const sigBytes = Uint8Array.from(fromBase64Url(parts[2]), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;

    // Decode payload
    const decoded = JSON.parse(fromBase64Url(parts[1])) as Record<string, unknown>;

    // Check expiry
    if (typeof decoded.exp === 'number' && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Guard that returns an admin email or a 401 Response.
 *
 * Checks in order:
 * 1. Authorization: Bearer <jwt> — our own signed JWT from /api/admin/login
 * 2. Cf-Access-Jwt-Assertion / X-Admin-Jwt — legacy Zero Trust headers
 * 3. Localhost dev bypass
 */
export async function requireAdmin(request: Request, env: Env): Promise<string | Response> {
  // 1. Check Bearer token (our JWT)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (payload && typeof payload.email === 'string') {
      return payload.email;
    }
    return new Response(
      JSON.stringify({ error: 'Unauthorized -- invalid or expired token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Localhost dev bypass (requires DEV_MODE=true)
  if (env.DEV_MODE === 'true') {
    const url = new URL(request.url);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return 'dev-admin@localhost';
    }
  }

  return new Response(
    JSON.stringify({ error: 'Unauthorized -- missing or invalid admin credentials' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}
