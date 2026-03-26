import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRandomSlug, calculateTrustTier, maybeUpgradeTier } from './trust-tiers';

type QueryResolver = {
  match: string | RegExp;
  first?: any | ((bindings: unknown[], sql: string) => Promise<any> | any);
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
        first: vi.fn(async () => {
          if (!resolver?.first) return null;
          if (typeof resolver.first === 'function') return resolver.first(bindings, sql);
          return resolver.first;
        }),
        run: vi.fn(async () => {
          if (!resolver?.run) return { success: true, meta: { changes: 1 } };
          if (typeof resolver.run === 'function') return resolver.run(bindings, sql);
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

describe('generateRandomSlug', () => {
  it('produces cantonese-dish-code format strings', () => {
    const slug = generateRandomSlug();
    expect(slug).toMatch(/^[a-z][-a-z]+-[a-z0-9]{4}$/);
    expect(slug.length).toBeGreaterThanOrEqual(8);
  });

  it('produces different slugs on successive calls', () => {
    const slugs = new Set(Array.from({ length: 10 }, () => generateRandomSlug()));
    // With 36^5 possibilities, 10 calls should almost certainly be unique
    expect(slugs.size).toBeGreaterThan(1);
  });
});

describe('calculateTrustTier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 for agent with no owner and < 3 mutual contacts', () => {
    const db = createMockDB([
      { match: 'SELECT owner_id', first: { owner_id: null, created_at: 1700000000 } },
      { match: 'COUNT(*)', first: { count: 1 } },
    ]);
    const env = createEnv(db);

    return calculateTrustTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(0);
    });
  });

  it('returns 1 for agent with owner', () => {
    const db = createMockDB([
      { match: 'SELECT owner_id', first: { owner_id: 'user-1', created_at: 1700000000 } },
      { match: /COUNT\(\*\).*contacts/, first: { count: 0 } },
      { match: /COUNT\(\*\).*sent_emails/, first: { count: 2 } },
      { match: /COUNT\(\*\).*FROM emails/, first: { count: 1 } },
    ]);
    const env = createEnv(db);

    return calculateTrustTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(1);
    });
  });

  it('returns 1 for agent with 3+ mutual contacts', () => {
    const db = createMockDB([
      { match: 'SELECT owner_id', first: { owner_id: null, created_at: 1700000000 } },
      { match: /COUNT\(\*\).*contacts/, first: { count: 3 } },
      { match: /COUNT\(\*\).*sent_emails/, first: { count: 0 } },
      { match: /COUNT\(\*\).*FROM emails/, first: { count: 0 } },
    ]);
    const env = createEnv(db);

    return calculateTrustTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(1);
    });
  });

  it('returns 2 for agent meeting all tier 2 criteria', () => {
    const now = Math.floor(Date.now() / 1000);
    const eightDaysAgo = now - 8 * 24 * 60 * 60;

    const db = createMockDB([
      { match: 'SELECT owner_id', first: { owner_id: 'user-1', created_at: eightDaysAgo } },
      { match: /COUNT\(\*\).*contacts/, first: { count: 5 } },
      { match: /COUNT\(\*\).*sent_emails/, first: { count: 15 } },
      { match: /COUNT\(\*\).*FROM emails/, first: { count: 12 } },
    ]);
    const env = createEnv(db);

    return calculateTrustTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(2);
    });
  });

  it('returns 0 for non-existent agent', () => {
    const db = createMockDB([
      { match: 'SELECT owner_id', first: null },
    ]);
    const env = createEnv(db);

    return calculateTrustTier(env as any, 'nonexistent').then(tier => {
      expect(tier).toBe(0);
    });
  });
});

describe('maybeUpgradeTier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upgrades tier when agent qualifies for higher tier', () => {
    const db = createMockDB([
      { match: 'SELECT trust_tier', first: { trust_tier: 0 } },
      { match: 'SELECT owner_id', first: { owner_id: 'user-1', created_at: 1700000000 } },
      { match: /COUNT\(\*\).*contacts/, first: { count: 0 } },
      { match: /COUNT\(\*\).*sent_emails/, first: { count: 0 } },
      { match: /COUNT\(\*\).*FROM emails/, first: { count: 0 } },
    ]);
    const env = createEnv(db);

    return maybeUpgradeTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(1);
      const updateQuery = db.executed.find(q => q.sql.includes('UPDATE agents SET trust_tier'));
      expect(updateQuery).toBeTruthy();
      expect(updateQuery!.bindings[0]).toBe(1);
    });
  });

  it('does not downgrade tier', () => {
    const db = createMockDB([
      { match: 'SELECT trust_tier', first: { trust_tier: 2 } },
      { match: 'SELECT owner_id', first: { owner_id: null, created_at: 1700000000 } },
      { match: /COUNT\(\*\).*contacts/, first: { count: 0 } },
    ]);
    const env = createEnv(db);

    return maybeUpgradeTier(env as any, 'agent-1').then(tier => {
      expect(tier).toBe(2);
      const updateQuery = db.executed.find(q => q.sql.includes('UPDATE agents SET trust_tier'));
      expect(updateQuery).toBeUndefined();
    });
  });
});
