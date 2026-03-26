import { Env } from './types';
import { nowUnix } from './utils';

type WindowType = 'hour' | 'day';

export type RegistrationRateLimitResult =
  | { allowed: true }
  | { allowed: false; limit: 'per_hour' | 'per_day' | 'global_hour' | 'global_day' | 'fingerprint' };

const WINDOW_LIMITS: Array<{
  windowType: WindowType;
  sizeSeconds: number;
  limit: number;
  limitName: 'per_hour' | 'per_day';
}> = [
  {
    windowType: 'hour',
    sizeSeconds: 60 * 60,
    limit: 5,
    limitName: 'per_hour',
  },
  {
    windowType: 'day',
    sizeSeconds: 24 * 60 * 60,
    limit: 20,
    limitName: 'per_day',
  },
];

function getWindowStart(now: number, sizeSeconds: number): number {
  return now - (now % sizeSeconds);
}

export async function checkRegistrationRateLimit(
  env: Env,
  ipAddress: string,
  now = nowUnix(),
): Promise<RegistrationRateLimitResult> {
  for (const window of WINDOW_LIMITS) {
    const windowStart = getWindowStart(now, window.sizeSeconds);

    const result = await env.DB.prepare(`
      INSERT INTO registration_rate_limits (ip_address, window_type, window_start, count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(ip_address, window_type, window_start)
      DO UPDATE SET
        count = registration_rate_limits.count + 1,
        updated_at = excluded.updated_at
      WHERE registration_rate_limits.count < ?
    `).bind(
      ipAddress,
      window.windowType,
      windowStart,
      now,
      window.limit,
    ).run();

    if (Number(result.meta?.changes ?? 0) === 0) {
      return { allowed: false, limit: window.limitName };
    }
  }

  // Global rate limits (platform-wide)
  const globalResult = await checkGlobalRateLimit(env, now);
  if (!globalResult.allowed) return globalResult;

  return { allowed: true };
}

// ── Global Rate Limits ──────────────────────────────────────

const GLOBAL_LIMITS: Array<{
  windowType: string;
  sizeSeconds: number;
  limit: number;
  limitName: 'global_hour' | 'global_day';
}> = [
  { windowType: 'global_hour', sizeSeconds: 60 * 60, limit: 500, limitName: 'global_hour' },
  { windowType: 'global_day', sizeSeconds: 24 * 60 * 60, limit: 2000, limitName: 'global_day' },
];

async function checkGlobalRateLimit(
  env: Env,
  now: number,
): Promise<RegistrationRateLimitResult> {
  for (const window of GLOBAL_LIMITS) {
    const windowStart = getWindowStart(now, window.sizeSeconds);

    const result = await env.DB.prepare(`
      INSERT INTO global_rate_limits (window_type, window_start, count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(window_type, window_start)
      DO UPDATE SET
        count = global_rate_limits.count + 1,
        updated_at = excluded.updated_at
      WHERE global_rate_limits.count < ?
    `).bind(window.windowType, windowStart, now, window.limit).run();

    if (Number(result.meta?.changes ?? 0) === 0) {
      return { allowed: false, limit: window.limitName };
    }
  }
  return { allowed: true };
}

// ── Fingerprint Detection ──────────────────────────────────

const FINGERPRINT_LIMIT = 10;

export async function checkFingerprintLimit(
  env: Env,
  request: Request,
  ipAddress: string,
): Promise<RegistrationRateLimitResult> {
  const ua = request.headers.get('User-Agent') || '';
  const lang = request.headers.get('Accept-Language') || '';
  const raw = `${ipAddress}:${ua}:${lang}`;

  // SHA-256 fingerprint
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const now = nowUnix();
  const result = await env.DB.prepare(`
    INSERT INTO registration_fingerprints (fingerprint_hash, ip_address, first_seen_at, last_seen_at, registration_count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(fingerprint_hash)
    DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      registration_count = registration_fingerprints.registration_count + 1
    WHERE registration_fingerprints.registration_count < ?
  `).bind(hash, ipAddress, now, now, FINGERPRINT_LIMIT).run();

  if (Number(result.meta?.changes ?? 0) === 0) {
    return { allowed: false, limit: 'fingerprint' };
  }
  return { allowed: true };
}
