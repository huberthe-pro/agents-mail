import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

describe('Admin proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses ADMIN_APP_URL when proxying /admin requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>admin</html>', {
      status: 200,
      headers: { 'x-frame-options': 'DENY' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://agentsmail.org/admin/index.html?tab=agents'),
      {
        ADMIN_APP_URL: 'http://127.0.0.1:4173',
      } as any
    );

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4173/index.html?tab=agents');
    expect(response.headers.get('x-frame-options')).toBeNull();
  });
});
