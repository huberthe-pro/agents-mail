import { describe, expect, it, vi } from 'vitest';
import { handleAdminAuditLogs } from './handlers/admin/audit';
import { handleAdminListEmails } from './handlers/admin/emails';

function createAdminJwt(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
  return `header.${payload}.signature`;
}

function createMockDB(queryLog: Array<{ sql: string; bindings: unknown[] }>) {
  return {
    prepare: vi.fn((sql: string) => {
      let bindings: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bindings = args;
          queryLog.push({ sql, bindings: [...args] });
          return this;
        },
        first: vi.fn(async () => ({ total: 1 })),
        all: vi.fn(async () => ({ results: [] })),
      };
    }),
  };
}

describe('admin date filters', () => {
  it('converts YYYY-MM-DD email filters into unix-second day boundaries', async () => {
    const queryLog: Array<{ sql: string; bindings: unknown[] }> = [];
    const env = { DB: createMockDB(queryLog), DEV_MODE: 'true' };
    const request = new Request('http://localhost/api/admin/emails?date_start=2026-03-14&date_end=2026-03-15', {
      headers: {
        'Host': 'localhost',
      },
    });

    const response = await handleAdminListEmails(request, env as any, {});

    expect(response.status).toBe(200);
    expect(queryLog.find((entry) => entry.sql.includes('SELECT COUNT(*) as total FROM emails'))?.bindings).toEqual([
      1773446400,
      1773619199,
    ]);
    expect(queryLog.find((entry) => entry.sql.includes('ORDER BY e.received_at DESC'))?.bindings).toEqual([
      1773446400,
      1773619199,
      50,
      0,
    ]);
  });

  it('converts YYYY-MM-DD audit filters into unix-second day boundaries', async () => {
    const queryLog: Array<{ sql: string; bindings: unknown[] }> = [];
    const env = { DB: createMockDB(queryLog), DEV_MODE: 'true' };
    const request = new Request('http://localhost/api/admin/audit?date_start=2026-03-14&date_end=2026-03-15', {
      headers: {
        'Host': 'localhost',
      },
    });

    const response = await handleAdminAuditLogs(request, env as any, {});

    expect(response.status).toBe(200);
    expect(queryLog.find((entry) => entry.sql.includes('SELECT COUNT(*) as total FROM admin_audit_logs'))?.bindings).toEqual([
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
