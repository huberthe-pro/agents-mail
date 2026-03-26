import { beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertContactDirection, countMutualContacts } from './contact-graph';

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

describe('upsertContactDirection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new inbound contact when none exists', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: null },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'sender@test.com', 'Sender', 'inbound');

    expect(result.direction).toBe('inbound');
    expect(result.upgraded).toBe(false);
    // Should have INSERT'd
    const insertQuery = db.executed.find(q => q.sql.includes('INSERT INTO contacts'));
    expect(insertQuery).toBeTruthy();
    expect(insertQuery!.bindings).toContain('inbound');
    expect(insertQuery!.bindings).toContain('sender@test.com');
  });

  it('creates new outbound contact when none exists', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: null },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'recipient@test.com', '', 'outbound');

    expect(result.direction).toBe('outbound');
    expect(result.upgraded).toBe(false);
  });

  it('upgrades inbound to mutual when outbound event arrives', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: { id: 'contact-1', direction: 'inbound' } },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'user@test.com', '', 'outbound');

    expect(result.direction).toBe('mutual');
    expect(result.upgraded).toBe(true);
    const updateQuery = db.executed.find(q => q.sql.includes('UPDATE contacts'));
    expect(updateQuery).toBeTruthy();
    expect(updateQuery!.bindings[0]).toBe('mutual');
  });

  it('upgrades outbound to mutual when inbound event arrives', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: { id: 'contact-1', direction: 'outbound' } },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'user@test.com', '', 'inbound');

    expect(result.direction).toBe('mutual');
    expect(result.upgraded).toBe(true);
  });

  it('does not change mutual contacts', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: { id: 'contact-1', direction: 'mutual' } },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'user@test.com', '', 'inbound');

    expect(result.direction).toBe('mutual');
    expect(result.upgraded).toBe(false);
    // Should NOT have UPDATE'd
    const updateQuery = db.executed.find(q => q.sql.includes('UPDATE'));
    expect(updateQuery).toBeUndefined();
  });

  it('does not change same-direction contacts', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: { id: 'contact-1', direction: 'inbound' } },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'user@test.com', '', 'inbound');

    expect(result.direction).toBe('inbound');
    expect(result.upgraded).toBe(false);
    const updateQuery = db.executed.find(q => q.sql.includes('UPDATE'));
    expect(updateQuery).toBeUndefined();
  });

  it('upgrades manual to new direction', async () => {
    const db = createMockDB([
      { match: 'SELECT id, direction FROM contacts', first: { id: 'contact-1', direction: 'manual' } },
    ]);
    const env = createEnv(db);

    const result = await upsertContactDirection(env as any, 'agent-1', 'user@test.com', '', 'outbound');

    expect(result.direction).toBe('outbound');
    expect(result.upgraded).toBe(false);
    const updateQuery = db.executed.find(q => q.sql.includes('UPDATE'));
    expect(updateQuery).toBeTruthy();
    expect(updateQuery!.bindings[0]).toBe('outbound');
  });
});

describe('countMutualContacts', () => {
  it('returns count of mutual contacts', async () => {
    const db = createMockDB([
      { match: 'COUNT(*)', first: { count: 5 } },
    ]);
    const env = createEnv(db);

    const count = await countMutualContacts(env as any, 'agent-1');

    expect(count).toBe(5);
    expect(db.executed[0].bindings).toEqual(['agent-1', 'mutual']);
  });

  it('returns 0 when no mutual contacts', async () => {
    const db = createMockDB([
      { match: 'COUNT(*)', first: { count: 0 } },
    ]);
    const env = createEnv(db);

    const count = await countMutualContacts(env as any, 'agent-1');

    expect(count).toBe(0);
  });
});
