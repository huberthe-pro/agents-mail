import { Env } from '../types';
import { generateId, jsonResponse, nowUnix } from '../utils';
import { hashApiKey } from '../middleware/auth';
import { signJwt, getUserFromRequest } from '../middleware/jwt';

/**
 * POST /api/auth/magic-link
 * Send a Magic Link email to the user (human login only).
 */
export async function handleSendMagicLink(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { email } = await request.json() as any;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return jsonResponse({ error: 'Valid email is required' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: 5 min per email
  const { results: recentTokens } = await env.DB.prepare(
    'SELECT id FROM magic_link_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ?) AND created_at > unixepoch() - 300 AND used_at IS NULL'
  ).bind(normalizedEmail).all();

  if (recentTokens.length > 0) {
    return jsonResponse({ error: 'Magic link already sent. Please check your inbox or wait 5 minutes.' }, 429);
  }

  // Find or create user
  let userId: string;
  const { results: existingUsers } = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(normalizedEmail).all();

  if (existingUsers.length > 0) {
    userId = (existingUsers[0] as any).id;
  } else {
    userId = generateId();
    await env.DB.prepare(
      'INSERT INTO users (id, email) VALUES (?, ?)'
    ).bind(userId, normalizedEmail).run();
  }

  // Generate token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = 'mlk_' + Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await hashApiKey(token);
  const expiresAt = nowUnix() + 900; // 15 minutes

  const tokenId = generateId();
  await env.DB.prepare(
    'INSERT INTO magic_link_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(tokenId, userId, tokenHash, expiresAt).run();

  // Send email via Resend
  const verifyUrl = `https://agentsmail.org/auth/verify?token=${token}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Agents Mail <noreply@agentsmail.org>',
      to: [normalizedEmail],
      subject: '🤖 Sign in to Agents Mail',
      html: `
        <h2>Sign in to Agents Mail</h2>
        <p>Click the link below to sign in to your dashboard:</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#00d4ff;color:#0a0a0f;text-decoration:none;border-radius:6px;font-weight:bold;">Sign in to Dashboard</a></p>
        <p style="color:#666;font-size:12px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      `,
    }),
  });

  return jsonResponse({ ok: true, message: 'Check your inbox for the sign-in link' });
}

/**
 * GET /api/auth/verify?token=mlk_xxx
 * Verify Magic Link token, set session cookie, redirect to dashboard.
 */
export async function handleVerifyMagicLink(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || !token.startsWith('mlk_')) {
    return jsonResponse({ error: 'Invalid token' }, 400);
  }

  const tokenHash = await hashApiKey(token);
  const now = nowUnix();

  const { results } = await env.DB.prepare(
    'SELECT mt.id, mt.user_id, u.email FROM magic_link_tokens mt JOIN users u ON mt.user_id = u.id WHERE mt.token_hash = ? AND mt.expires_at > ? AND mt.used_at IS NULL'
  ).bind(tokenHash, now).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Invalid or expired token' }, 401);
  }

  const record = results[0] as any;

  // Mark token as used
  await env.DB.prepare(
    'UPDATE magic_link_tokens SET used_at = unixepoch() WHERE id = ?'
  ).bind(record.id).run();

  // Update last_login_at
  await env.DB.prepare(
    'UPDATE users SET last_login_at = unixepoch() WHERE id = ?'
  ).bind(record.user_id).run();

  // Sign JWT (7 days)
  const jwt = await signJwt(
    { sub: record.user_id, email: record.email, exp: now + 7 * 24 * 3600 },
    env.JWT_SECRET
  );

  // Return JWT token for the frontend to handle
  return jsonResponse({
    ok: true,
    token: jwt,
    user: { id: record.user_id, email: record.email },
  });
}

/**
 * POST /api/auth/logout
 */
export async function handleLogout(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  // Invalidate all sessions by updating session_invalidated_at
  await env.DB.prepare(
    'UPDATE users SET session_invalidated_at = unixepoch() WHERE id = ?'
  ).bind(user.userId).run();

  return jsonResponse({ ok: true });
}

/**
 * GET /api/auth/me
 */
export async function handleGetMe(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, email, display_name, created_at FROM users WHERE id = ?'
  ).bind(user.userId).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  return jsonResponse(results[0]);
}
