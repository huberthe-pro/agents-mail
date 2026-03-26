import { describe, expect, it } from 'vitest';
import { getCorsHeaders } from './utils';

describe('getCorsHeaders', () => {
  it('allows localhost on arbitrary ports', () => {
    const request = new Request('https://agentsmail.org/api/auth/me', {
      headers: { Origin: 'http://localhost:4173' },
    });

    expect(getCorsHeaders(request)['Access-Control-Allow-Origin']).toBe('http://localhost:4173');
  });

  it('allows 127.0.0.1 on arbitrary ports', () => {
    const request = new Request('https://agentsmail.org/api/auth/me', {
      headers: { Origin: 'http://127.0.0.1:3001' },
    });

    expect(getCorsHeaders(request)['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:3001');
  });
});
