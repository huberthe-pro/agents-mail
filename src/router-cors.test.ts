import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeRequest } from './router';

function createMockDB(queryResponses: Record<string, any> = {}) {
  const defaultResponse = { results: [], success: true };
  return {
    prepare: vi.fn((sql: string) => {
      const response = queryResponses[sql] || defaultResponse;
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue(response),
      };
    }),
  };
}

function createMockEnv(dbOverrides: Record<string, any> = {}) {
  return {
    DB: createMockDB(dbOverrides),
    RESEND_API_KEY: 'test-resend-key',
    DOMAIN: 'agentsmail.org',
    JWT_SECRET: 'test-jwt-secret-key-for-tests',
  };
}

describe('routeRequest CORS headers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  it('returns the caller origin for magic-link requests', async () => {
    const env = createMockEnv();
    const request = new Request('https://test.com/api/auth/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://agentsmail.org',
      },
      body: JSON.stringify({ email: 'new@test.com' }),
    });

    const response = await routeRequest(request, env as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://agentsmail.org');
  });
});
