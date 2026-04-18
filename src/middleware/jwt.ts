import { Env } from '../types';
import { nowUnix } from '../utils';

interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
}

function base64UrlEncode(data: Uint8Array): string {
  const str = btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(payload: Omit<JwtPayload, 'iat'>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = nowUnix();
  const fullPayload = { ...payload, iat: now };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const message = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${message}.${signatureB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const message = `${headerB64}.${payloadB64}`;

  try {
    const key = await getSigningKey(secret);
    const encoder = new TextEncoder();
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(message));
    if (!valid) return null;

    const payload: JwtPayload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    );

    // Check expiration
    const now = nowUnix();
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract user info from JWT in cookie or Authorization header.
 * Returns null if no valid session found (does NOT return an error response).
 */
export async function getUserFromRequest(
  request: Request,
  env: Env
): Promise<{ userId: string; email: string } | null> {
  // Try cookie first (Dashboard)
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/session_token=([^;]+)/);
  let token = sessionMatch?.[1];

  // Fall back to Authorization header (if JWT, not API Key)
  if (!token) {
    const auth = request.headers.get('Authorization');
    if (auth?.startsWith('Bearer ') && !auth.startsWith('Bearer am_sk_')) {
      token = auth.slice(7);
    }
  }

  if (!token) return null;

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;

  // Check session_invalidated_at
  const { results } = await env.DB.prepare(
    'SELECT session_invalidated_at FROM users WHERE id = ? AND is_active = 1'
  ).bind(payload.sub).all();

  if (results.length === 0) return null;

  const user = results[0] as any;
  if (user.session_invalidated_at && payload.iat < user.session_invalidated_at) {
    return null;
  }

  return { userId: payload.sub, email: payload.email };
}
