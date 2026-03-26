import { describe, expect, it, vi } from 'vitest';
import { handleAdminEmailEvents, handleAdminEmailGovernanceSummary } from './handlers/admin/email-events';

function createAdminJwt(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
  return `header.${payload}.signature`;
}

function createMockDB(queryLog?: Array<{ sql: string; bindings: unknown[] }>) {
  return {
    prepare: vi.fn((sql: string) => {
      let bindings: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bindings = args;
          queryLog?.push({ sql, bindings: [...args] });
          return this;
        },
        all: vi.fn(async () => {
          if (sql.includes('SELECT COUNT(*) as total FROM email_events')) {
            return { results: [{ total: 1 }] };
          }
          if (sql.includes('FROM email_events')) {
            return {
              results: [{
                id: 'evt-1',
                agent_id: 'agent-1',
                email_id: 'email-1',
                direction: 'outbound',
                event_type: 'sent',
                metadata: '{"to":"recipient@example.com"}',
                created_at: 1700000000,
              }],
            };
          }
          return { results: [], bindings };
        }),
      };
    }),
  };
}

function createSummaryMockDB() {
  return {
    prepare: vi.fn((sql: string) => {
      let bindings: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bindings = args;
          return this;
        },
        all: vi.fn(async () => {
          if (sql.includes('GROUP BY agent_id') && bindings[0] === 'rate_limited') {
            return {
              results: [
                { agent_id: 'agent-1', event_type: 'rate_limited', event_count: 2, latest_at: 1700000000 },
              ],
            };
          }
          if (sql.includes('GROUP BY agent_id') && bindings[0] === 'duplicate') {
            return {
              results: [
                { agent_id: 'agent-2', event_type: 'duplicate', event_count: 3, latest_at: 1700000100 },
              ],
            };
          }
          if (sql.includes('COUNT(*) as total') && bindings[0] === 'received') {
            return { results: [{ total: 14 }] };
          }
          if (sql.includes('COUNT(*) as total') && bindings[0] === 'sent') {
            return { results: [{ total: 9 }] };
          }
          if (sql.includes('COUNT(*) as total') && bindings[0] === 'duplicate') {
            return { results: [{ total: 3 }] };
          }
          if (sql.includes('COUNT(*) as total') && bindings[0] === 'rate_limited') {
            return { results: [{ total: 2 }] };
          }
          if (sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT 10')) {
            return {
              results: [
                {
                  id: 'evt-1',
                  agent_id: 'agent-1',
                  email_id: 'email-1',
                  direction: 'outbound',
                  event_type: 'rate_limited',
                  metadata: '{"limit":"per_minute"}',
                  created_at: 1700000000,
                },
              ],
            };
          }
          return { results: [], bindings };
        }),
      };
    }),
  };
}

describe('handleAdminEmailEvents', () => {
  it('rejects requests without admin identity', async () => {
    const env = { DB: createMockDB() };
    const request = new Request('https://example.com/api/admin/email-events');

    const response = await handleAdminEmailEvents(request, env as any, {});

    expect(response.status).toBe(401);
  });

  it('lists paginated email event logs for admins', async () => {
    const env = { DB: createMockDB(), DEV_MODE: 'true' };
    const request = new Request('http://localhost/api/admin/email-events?direction=outbound', {
      headers: {
        'Host': 'localhost',
      },
    });

    const response = await handleAdminEmailEvents(request, env as any, {});
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe('sent');
    expect(body.pagination.total).toBe(1);
  });

  it('converts YYYY-MM-DD filters into unix-second boundaries', async () => {
    const queryLog: Array<{ sql: string; bindings: unknown[] }> = [];
    const env = { DB: createMockDB(queryLog), DEV_MODE: 'true' };
    const request = new Request('http://localhost/api/admin/email-events?date_start=2026-03-14&date_end=2026-03-15', {
      headers: {
        'Host': 'localhost',
      },
    });

    const response = await handleAdminEmailEvents(request, env as any, {});

    expect(response.status).toBe(200);
    expect(queryLog.find((entry) => entry.sql.includes('SELECT COUNT(*) as total FROM email_events'))?.bindings).toEqual([
      1773446400,
      1773619199,
    ]);
    expect(queryLog.find((entry) => entry.sql.includes('ORDER BY created_at DESC'))?.bindings).toEqual([
      1773446400,
      1773619199,
      50,
      0,
    ]);
  });
});

describe('handleAdminEmailGovernanceSummary', () => {
  it('rejects summary requests without admin identity', async () => {
    const env = { DB: createSummaryMockDB() };
    const request = new Request('https://example.com/api/admin/email-governance/summary');

    const response = await handleAdminEmailGovernanceSummary(request, env as any, {});

    expect(response.status).toBe(401);
  });

  it('returns governance counts, recent events, and anomalies for admins', async () => {
    const env = { DB: createSummaryMockDB(), DEV_MODE: 'true' };
    const request = new Request('http://localhost/api/admin/email-governance/summary', {
      headers: {
        'Host': 'localhost',
      },
    });

    const response = await handleAdminEmailGovernanceSummary(request, env as any, {});
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.counts).toEqual({
      received_24h: 14,
      sent_24h: 9,
      duplicate_24h: 3,
      rate_limited_24h: 2,
    });
    expect(body.recent_events).toHaveLength(1);
    expect(body.anomalies).toHaveLength(2);
    expect(body.anomalies.map((item: any) => item.event_type)).toEqual(
      expect.arrayContaining(['rate_limited', 'duplicate']),
    );
  });
});
