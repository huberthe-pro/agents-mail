import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../email-worker';

// postal-mime returns empty body for minimal raw emails in tests
vi.mock('postal-mime', () => ({
  default: { parse: vi.fn().mockResolvedValue({ text: 'plain body', html: '<p>html body</p>' }) },
}));

function makeDb(overrides: Partial<{
  agent: any;
  acl: any[];
  aclCount: number;
  duplicate: any[];
}> = {}) {
  const agent = 'agent' in overrides ? overrides.agent : { id: 'agent-1', name: 'myagent' };
  const acl = overrides.acl ?? [];
  const aclCount = overrides.aclCount ?? 0;
  const duplicate = overrides.duplicate ?? [];

  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockImplementation(() => {
        if (sql.includes('FROM agents')) return Promise.resolve({ results: agent ? [agent] : [] });
        if (sql.includes('FROM acl WHERE agent_id = ? AND email')) return Promise.resolve({ results: acl });
        if (sql.includes('COUNT(*) as count FROM acl')) return Promise.resolve({ results: [{ count: aclCount }] });
        if (sql.includes('FROM emails WHERE')) return Promise.resolve({ results: duplicate });
        return Promise.resolve({ results: [] });
      }),
      run: vi.fn().mockResolvedValue({}),
    })),
  };
}

function makeEnv(dbOverrides = {}) {
  return {
    DB: makeDb(dbOverrides),
    DOMAIN: 'agentsmail.org',
    RESEND_API_KEY: 'test-key',
  } as any;
}

function makeMessage(overrides: Partial<{
  from: string;
  to: string;
  subject: string;
  messageId: string;
}> = {}) {
  const reject = vi.fn();
  const msg = {
    from: overrides.from ?? 'sender@example.com',
    to: overrides.to ?? 'myagent@agentsmail.org',
    headers: new Headers({
      subject: overrides.subject ?? 'Hello',
      ...(overrides.messageId ? { 'message-id': overrides.messageId } : {}),
    }),
    raw: new ReadableStream(),
    rawSize: 0,
    setReject: reject,
  };
  return { msg, reject };
}

describe('email worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    vi.stubGlobal('Response', class MockResponse {
      constructor(public body?: any, public init?: any) {}
      async arrayBuffer() { return new ArrayBuffer(0); }
      get ok() { return (this.init?.status ?? 200) < 400; }
    });
  });

  it('stores email directly in D1 without HTTP forwarding', async () => {
    const env = makeEnv();
    const { msg, reject } = makeMessage();

    await worker.email(msg as any, env);

    const fetchCalls = (fetch as any).mock.calls as [string, any][];
    const inboundCalls = fetchCalls.filter(([url]) => String(url).includes('/inbound'));
    expect(inboundCalls).toHaveLength(0);

    const prepareCalls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const insertCall = prepareCalls.find(([sql]) => sql.includes('INSERT INTO emails'));
    expect(insertCall).toBeTruthy();
    expect(reject).not.toHaveBeenCalled();
  });

  it('extracts message-id header for deduplication', async () => {
    const env = makeEnv();
    const { msg } = makeMessage({ messageId: '<msg-123@example.com>' });

    await worker.email(msg as any, env);

    const prepareCalls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const insertCall = prepareCalls.find(([sql]) => sql.includes('INSERT INTO emails'));
    expect(insertCall).toBeTruthy();
  });

  it('rejects email when agent is not found', async () => {
    const env = makeEnv({ agent: null });
    const { msg, reject } = makeMessage();

    await worker.email(msg as any, env);

    expect(reject).toHaveBeenCalledWith('Recipient not found');
  });

  it('rejects email from blacklisted sender', async () => {
    const env = makeEnv({ acl: [{ type: 'blacklist' }] });
    const { msg, reject } = makeMessage();

    await worker.email(msg as any, env);

    expect(reject).toHaveBeenCalledWith('Sender blocked');
  });

  it('rejects email from sender not in whitelist when whitelist mode is active', async () => {
    const env = makeEnv({ acl: [], aclCount: 2 });
    const { msg, reject } = makeMessage();

    await worker.email(msg as any, env);

    expect(reject).toHaveBeenCalledWith('Sender not in whitelist');
  });

  it('allows email when sender is in whitelist', async () => {
    const env = makeEnv({ acl: [{ type: 'whitelist' }], aclCount: 1 });
    const { msg, reject } = makeMessage();

    await worker.email(msg as any, env);

    expect(reject).not.toHaveBeenCalled();
  });

  it('rejects email with unknown domain', async () => {
    const env = makeEnv();
    const { msg, reject } = makeMessage({ to: 'myagent@unknown.com' });

    await worker.email(msg as any, env);

    expect(reject).toHaveBeenCalledWith('Unknown domain');
  });

  it('skips duplicate emails without inserting', async () => {
    const env = makeEnv({ duplicate: [{ id: 'existing-id' }] });
    const { msg, reject } = makeMessage({ messageId: '<dup@example.com>' });

    await worker.email(msg as any, env);

    expect(reject).not.toHaveBeenCalled();
    const prepareCalls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const insertCalls = prepareCalls.filter(([sql]) => sql.includes('INSERT INTO emails'));
    expect(insertCalls).toHaveLength(0);
  });

  it('parses "Name <email>" and uses bare email for ACL lookup', async () => {
    const env = makeEnv();
    const { msg, reject } = makeMessage({ from: 'John Doe <john@example.com>' });

    await worker.email(msg as any, env);

    expect(reject).not.toHaveBeenCalled();
    const prepareCalls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const aclCheck = prepareCalls.find(([sql]) => sql.includes('FROM acl WHERE agent_id = ? AND email'));
    expect(aclCheck).toBeTruthy();
  });
});
