import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRegistrationRateLimit } from './registration-rate-limits';

type QueryResolver = {
  match: string | RegExp;
  run?: any | ((bindings: unknown[], sql: string) => Promise<any> | any);
};

function createMockDB(resolvers: QueryResolver[] = []) {
  const executed: Array<{ sql: string; bindings: unknown[] }> = [];

  return {
    executed,
    prepare: vi.fn((sql: string) => {
      const resolver = resolvers.find((item) =>
        typeof item.match === 'string' ? sql.includes(item.match) : item.match.test(sql)
      );
      let bindings: unknown[] = [];

      return {
        bind(...args: unknown[]) {
          bindings = args;
          executed.push({ sql, bindings });
          return this;
        },
        run: vi.fn(async () => {
          if (!resolver?.run) {
            return { success: true, meta: { changes: 1 } };
          }
          if (typeof resolver.run === 'function') {
            return resolver.run(bindings, sql);
          }
          return resolver.run;
        }),
      };
    }),
  };
}

function createEnv(db: ReturnType<typeof createMockDB>) {
  return {
    DB: db as any,
    RESEND_API_KEY: 'test',
    DOMAIN: 'test.com',
    JWT_SECRET: 'secret',
  };
}

describe('checkRegistrationRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows registration when under both limits', async () => {
    const db = createMockDB();
    const env = createEnv(db);

    const result = await checkRegistrationRateLimit(env as any, '1.2.3.4', 1000000);

    expect(result.allowed).toBe(true);
    // Should have claimed: IP hour + IP day + global hour + global day
    expect(db.executed.length).toBe(4);
  });

  it('blocks when hourly limit is reached', async () => {
    const db = createMockDB([
      {
        match: 'registration_rate_limits',
        run: (bindings: unknown[]) => {
          const windowType = bindings[1];
          if (windowType === 'hour') {
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);
    const env = createEnv(db);

    const result = await checkRegistrationRateLimit(env as any, '1.2.3.4', 1000000);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.limit).toBe('per_hour');
    }
  });

  it('blocks when daily limit is reached', async () => {
    let callCount = 0;
    const db = createMockDB([
      {
        match: 'registration_rate_limits',
        run: () => {
          callCount++;
          // First call (hour) succeeds, second call (day) fails
          if (callCount === 1) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      },
    ]);
    const env = createEnv(db);

    const result = await checkRegistrationRateLimit(env as any, '1.2.3.4', 1000000);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.limit).toBe('per_day');
    }
  });

  it('uses correct window boundaries', async () => {
    const db = createMockDB();
    const env = createEnv(db);
    const now = 1700000000; // fixed timestamp

    await checkRegistrationRateLimit(env as any, '10.0.0.1', now);

    // Hour window start: 1700000000 - (1700000000 % 3600) = 1699999200
    const hourWindowStart = now - (now % 3600);
    // Day window start: 1700000000 - (1700000000 % 86400) = 1699920000
    const dayWindowStart = now - (now % 86400);

    expect(db.executed[0].bindings).toEqual(['10.0.0.1', 'hour', hourWindowStart, now, 5]);
    expect(db.executed[1].bindings).toEqual(['10.0.0.1', 'day', dayWindowStart, now, 20]);
  });

  it('different IPs have independent limits', async () => {
    const db = createMockDB();
    const env = createEnv(db);

    const result1 = await checkRegistrationRateLimit(env as any, '1.1.1.1', 1000000);
    const result2 = await checkRegistrationRateLimit(env as any, '2.2.2.2', 1000000);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    // Each IP: 2 IP queries + 2 global queries = 4 per call, 8 total
    expect(db.executed.length).toBe(8);
    expect(db.executed[0].bindings[0]).toBe('1.1.1.1');
    expect(db.executed[4].bindings[0]).toBe('2.2.2.2');
  });
});
