import { Env } from './types';
import { nowUnix } from './utils';

type WindowType = 'minute' | 'hour';

type ClaimedWindow = {
  windowType: WindowType;
  windowStart: number;
};

export type OutboundSendReservation = {
  claimedAt: number;
  windows: ClaimedWindow[];
};

export type OutboundSendRateLimitResult =
  | { allowed: true; reservation: OutboundSendReservation }
  | { allowed: false; limit: 'per_minute' | 'per_hour' };

const WINDOW_LIMITS: Array<{
  windowType: WindowType;
  sizeSeconds: number;
  limit: number;
  limitName: 'per_minute' | 'per_hour';
}> = [
  {
    windowType: 'minute',
    sizeSeconds: 60,
    limit: 60,
    limitName: 'per_minute',
  },
  {
    windowType: 'hour',
    sizeSeconds: 60 * 60,
    limit: 1000,
    limitName: 'per_hour',
  },
];

function getWindowStart(now: number, sizeSeconds: number): number {
  return now - (now % sizeSeconds);
}

async function claimWindowSlot(
  env: Env,
  agentId: string,
  windowType: WindowType,
  windowStart: number,
  now: number,
  limit: number,
): Promise<boolean> {
  const result = await env.DB.prepare(`
    INSERT INTO email_rate_limits (agent_id, window_type, window_start, count, updated_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(agent_id, window_type, window_start)
    DO UPDATE SET
      count = email_rate_limits.count + 1,
      updated_at = excluded.updated_at
    WHERE email_rate_limits.count < ?
  `).bind(
    agentId,
    windowType,
    windowStart,
    now,
    limit,
  ).run();

  return Number(result.meta?.changes ?? 0) > 0;
}

async function releaseWindowSlot(
  env: Env,
  agentId: string,
  windowType: WindowType,
  windowStart: number,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE email_rate_limits SET count = count - 1, updated_at = ? WHERE agent_id = ? AND window_type = ? AND window_start = ? AND count > 0'
  ).bind(
    now,
    agentId,
    windowType,
    windowStart,
  ).run();

  await env.DB.prepare(
    'DELETE FROM email_rate_limits WHERE count <= 0 AND agent_id = ? AND window_type = ? AND window_start = ?'
  ).bind(
    agentId,
    windowType,
    windowStart,
  ).run();
}

export async function reserveOutboundSendSlot(
  env: Env,
  agentId: string,
  now = nowUnix(),
): Promise<OutboundSendRateLimitResult> {
  const claimedWindows: ClaimedWindow[] = [];

  for (const window of WINDOW_LIMITS) {
    const windowStart = getWindowStart(now, window.sizeSeconds);
    const claimed = await claimWindowSlot(
      env,
      agentId,
      window.windowType,
      windowStart,
      now,
      window.limit,
    );

    if (!claimed) {
      await Promise.all(
        claimedWindows.map((claimedWindow) =>
          releaseWindowSlot(env, agentId, claimedWindow.windowType, claimedWindow.windowStart, now)
        )
      );

      return {
        allowed: false,
        limit: window.limitName,
      };
    }

    claimedWindows.push({
      windowType: window.windowType,
      windowStart,
    });
  }

  return {
    allowed: true,
    reservation: {
      claimedAt: now,
      windows: claimedWindows,
    },
  };
}

export async function releaseOutboundSendSlot(
  env: Env,
  agentId: string,
  reservation: OutboundSendReservation,
): Promise<void> {
  await Promise.all(
    reservation.windows.map((window) =>
      releaseWindowSlot(env, agentId, window.windowType, window.windowStart, reservation.claimedAt)
    )
  );
}
