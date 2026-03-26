import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGetEmailDetail, handleSendEmail } from './handlers/emails';
import { routeRequest } from './router';

type QueryResolver = {
  match: string | RegExp;
  all?: { results: any[] } | ((bindings: unknown[], sql: string) => Promise<{ results: any[] }> | { results: any[] });
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
        all: vi.fn(async () => {
          if (!resolver?.all) {
            return { results: [] };
          }
          if (typeof resolver.all === 'function') {
            return resolver.all(bindings, sql);
          }
          return resolver.all;
        }),
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
    RESEND_API_KEY: 'test-resend-key',
    DOMAIN: 'agentsmail.org',
    JWT_SECRET: 'test-jwt-secret',
  };
}

describe('email handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('requires authentication before marking an email as read', async () => {
    const db = createMockDB([
      {
        match: 'SELECT agent_id FROM emails WHERE id = ?',
        all: { results: [{ agent_id: 'agent-1' }] },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/emails/email-1/read', {
      method: 'PUT',
    });

    const response = await routeRequest(request, env as any);

    expect(response.status).toBe(401);
  });

  it('rejects legacy outbound payloads without content.text', async () => {
    const db = createMockDB();
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Legacy payload',
        body: 'Old body field',
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });

    expect(response.status).toBe(400);
  });

  it('sends structured outbound mail and stores metadata separately', async () => {
    const sentBodies: any[] = [];
    const insertBindings: unknown[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentBodies.push(JSON.parse(String(init?.body || '{}')));
        return new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 });
      })
    );

    const db = createMockDB([
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: (bindings: unknown[]) => {
          insertBindings.push(bindings);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Structured payload',
        content: {
          text: 'Hello from content.text',
          metadata: {
            thread: 'alpha',
          },
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });

    expect(response.status).toBe(201);
    // Resend payload includes growth signature for tier 1 agents
    expect(sentBodies[0].text).toContain('Hello from content.text');
    expect(sentBodies[0].text).toContain('Sent via Agents Mail');
    // DB stores original text without signature
    expect(insertBindings).toHaveLength(1);
    expect(insertBindings[0][4]).toBe('Hello from content.text');
    expect(insertBindings[0][5]).toBe(JSON.stringify({ thread: 'alpha' }));
  });

  it('sanitizes outbound html before sending and storing it', async () => {
    const sentBodies: any[] = [];
    const insertBindings: unknown[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentBodies.push(JSON.parse(String(init?.body || '{}')));
        return new Response(JSON.stringify({ id: 'resend-html-123' }), { status: 200 });
      })
    );

    const db = createMockDB([
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: (bindings: unknown[]) => {
          insertBindings.push(bindings);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Sanitized HTML',
        content: {
          text: 'Safe fallback',
          html: '<p onclick="evil()">Hello</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.com" onclick="evil()">safe</a>',
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });

    expect(response.status).toBe(201);
    expect(sentBodies[0].html).toContain('<p>Hello</p>');
    expect(sentBodies[0].html).not.toContain('script');
    expect(sentBodies[0].html).not.toContain('onclick');
    expect(sentBodies[0].html).not.toContain('javascript:');
    expect(sentBodies[0].html).toContain('Agents Mail'); // growth signature for tier 1
    // DB stores original sanitized html without signature
    expect(insertBindings[0][6]).toContain('<p>Hello</p>');
    expect(insertBindings[0][6]).not.toContain('Agents Mail');
  });

  it('escapes quotes inside sanitized anchor href values', async () => {
    const sentBodies: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentBodies.push(JSON.parse(String(init?.body || '{}')));
        return new Response(JSON.stringify({ id: 'resend-html-quoted' }), { status: 200 });
      })
    );

    const db = createMockDB([
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: { success: true, meta: { changes: 1 } },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Quoted href',
        content: {
          text: 'Safe fallback',
          html: `<a href='https://example.com" onclick="alert(1)'>quoted</a>`,
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });

    expect(response.status).toBe(201);
    expect(sentBodies[0].html).not.toContain('onclick=');
    expect(sentBodies[0].html).toContain('<a>quoted</a>');
    expect(sentBodies[0].html).toContain('Agents Mail'); // growth signature
  });

  it('returns sanitized_html in email detail responses', async () => {
    const db = createMockDB([
      {
        match: 'FROM emails WHERE id = ? AND agent_id = ?',
        all: {
          results: [{
            id: 'email-1',
            agent_id: 'agent-1',
            from_address: 'sender@example.com',
            from_name: 'Sender',
            subject: 'Preview html',
            body_text: 'Safe text',
            body_html: '<p>Safe html</p>',
            received_at: 1700000000,
            is_read: 0,
            metadata_json: null,
          }],
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails/email-1');

    const response = await handleGetEmailDetail(request, env as any, { agentId: 'agent-1', emailId: 'email-1' });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.sanitized_html).toBe('<p>Safe html</p>');
  });

  it('re-sanitizes legacy body_html before returning sanitized_html', async () => {
    const db = createMockDB([
      {
        match: 'FROM emails WHERE id = ? AND agent_id = ?',
        all: {
          results: [{
            id: 'email-legacy',
            agent_id: 'agent-1',
            from_address: 'sender@example.com',
            from_name: 'Sender',
            subject: 'Legacy html',
            body_text: 'Legacy text',
            body_html: `<div>Safe</div><a href='https://example.com" onclick="alert(1)'>quoted</a><script>alert(2)</script>`,
            received_at: 1700000000,
            is_read: 0,
            metadata_json: null,
          }],
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails/email-legacy');

    const response = await handleGetEmailDetail(request, env as any, { agentId: 'agent-1', emailId: 'email-legacy' });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.sanitized_html).not.toContain('onclick=');
    expect(body.sanitized_html).not.toContain('<script');
    expect(body.sanitized_html).toContain('<a>quoted</a>');
  });

  it('rate limits outbound sends that exceed the per-minute threshold', async () => {
    const fixedNow = 1_700_000_000;
    const minuteWindowStart = fixedNow - (fixedNow % 60);
    const hourWindowStart = fixedNow - (fixedNow % (60 * 60));
    const reservedWindows = new Map<string, number>([
      [`agent-1:minute:${minuteWindowStart}`, 60],
      [`agent-1:hour:${hourWindowStart}`, 500],
    ]);

    vi.spyOn(Date, 'now').mockReturnValue(fixedNow * 1000);
    vi.stubGlobal('fetch', vi.fn());

    const db = createMockDB([
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO email_rate_limits',
        run: (bindings: unknown[]) => {
          const agentId = String(bindings[0]);
          const windowType = String(bindings[1]);
          const windowStart = Number(bindings[2]);
          const limit = Number(bindings[4]);
          const key = `${agentId}:${windowType}:${windowStart}`;
          const current = reservedWindows.get(key) ?? 0;

          if (current >= limit) {
            return { success: true, meta: { changes: 0 } };
          }

          reservedWindows.set(key, current + 1);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Too many emails',
        content: {
          text: 'Hello',
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });
    const body = await response.json() as any;

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('only allows one concurrent outbound send to claim the final rate-limit slot', async () => {
    const fixedNow = 1_700_000_000;
    const minuteWindowStart = fixedNow - (fixedNow % 60);
    const hourWindowStart = fixedNow - (fixedNow % (60 * 60));
    const reservedWindows = new Map<string, number>([
      [`agent-1:minute:${minuteWindowStart}`, 59],
      [`agent-1:hour:${hourWindowStart}`, 999],
    ]);
    const sentEmailBindings: unknown[][] = [];

    vi.spyOn(Date, 'now').mockReturnValue(fixedNow * 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await Promise.resolve();
        return new Response(JSON.stringify({ id: 'resend-concurrent-123' }), { status: 200 });
      })
    );

    const db = createMockDB([
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO email_rate_limits',
        run: (bindings: unknown[]) => {
          const agentId = String(bindings[0]);
          const windowType = String(bindings[1]);
          const windowStart = Number(bindings[2]);
          const limit = Number(bindings[4]);
          const key = `${agentId}:${windowType}:${windowStart}`;
          const current = reservedWindows.get(key) ?? 0;

          if (current >= limit) {
            return { success: true, meta: { changes: 0 } };
          }

          reservedWindows.set(key, current + 1);
          return { success: true, meta: { changes: 1 } };
        },
      },
      {
        match: 'UPDATE email_rate_limits SET count = count - 1',
        run: (bindings: unknown[]) => {
          const agentId = String(bindings[1]);
          const windowType = String(bindings[2]);
          const windowStart = Number(bindings[3]);
          const key = `${agentId}:${windowType}:${windowStart}`;
          const current = reservedWindows.get(key) ?? 0;

          if (current > 0) {
            reservedWindows.set(key, current - 1);
          }

          return { success: true, meta: { changes: current > 0 ? 1 : 0 } };
        },
      },
      {
        match: 'DELETE FROM email_rate_limits WHERE count <= 0',
        run: (bindings: unknown[]) => {
          const agentId = String(bindings[0]);
          const windowType = String(bindings[1]);
          const windowStart = Number(bindings[2]);
          const key = `${agentId}:${windowType}:${windowStart}`;

          if ((reservedWindows.get(key) ?? 0) <= 0) {
            reservedWindows.delete(key);
          }

          return { success: true, meta: { changes: 1 } };
        },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: (bindings: unknown[]) => {
          sentEmailBindings.push(bindings);
          return { success: true, meta: { changes: 1 } };
        },
      },
      {
        match: 'INSERT INTO email_events',
        run: { success: true, meta: { changes: 1 } },
      },
    ]);
    const env = createEnv(db);
    const createRequest = () => new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Concurrent send',
        content: {
          text: 'Hello',
        },
      }),
    });

    const [first, second] = await Promise.all([
      handleSendEmail(createRequest(), env as any, { agentId: 'agent-1' }),
      handleSendEmail(createRequest(), env as any, { agentId: 'agent-1' }),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);

    expect(statuses).toEqual([201, 429]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentEmailBindings).toHaveLength(1);
  });

  it('writes an outbound sent event for governance tracking', async () => {
    const eventBindings: unknown[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'resend-audit-123' }), { status: 200 }))
    );

    const db = createMockDB([
      {
        match: 'SELECT COUNT(*) as count FROM sent_emails WHERE agent_id = ? AND sent_at >= ?',
        all: { results: [{ count: 0 }] },
      },
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: { success: true, meta: { changes: 1 } },
      },
      {
        match: 'INSERT INTO email_events',
        run: (bindings: unknown[]) => {
          eventBindings.push(bindings);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Audit me',
        content: {
          text: 'Hello',
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });

    expect(response.status).toBe(201);
    expect(eventBindings).toHaveLength(1);
    expect(eventBindings[0][3]).toBe('outbound');
    expect(eventBindings[0][4]).toBe('sent');
  });

  it('does not fail outbound sends when event logging fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'resend-safe-123' }), { status: 200 }))
    );

    const db = createMockDB([
      {
        match: 'SELECT COUNT(*) as count FROM sent_emails WHERE agent_id = ? AND sent_at >= ?',
        all: { results: [{ count: 0 }] },
      },
      {
        match: 'SELECT email, name, trust_tier FROM agents WHERE id = ?',
        all: { results: [{ email: 'agent@agentsmail.org', name: 'Agent', trust_tier: 1 }] },
      },
      {
        match: 'INSERT INTO email_rate_limits',
        run: { success: true, meta: { changes: 1 } },
      },
      {
        match: 'INSERT INTO sent_emails',
        run: { success: true, meta: { changes: 1 } },
      },
      {
        match: 'INSERT INTO email_events',
        run: () => {
          throw new Error('email event insert failed');
        },
      },
    ]);
    const env = createEnv(db);
    const request = new Request('https://example.com/api/agents/agent-1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'recipient@example.com',
        subject: 'Audit fallback',
        content: {
          text: 'Hello',
        },
      }),
    });

    const response = await handleSendEmail(request, env as any, { agentId: 'agent-1' });
    const body = await response.json() as any;

    expect(response.status).toBe(201);
    expect(body.resend_id).toBe('resend-safe-123');
  });

});
