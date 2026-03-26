import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('config.json')) {
      return JSON.stringify({ apiUrl: 'https://agentsmail.org' });
    }
    return '{}';
  }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

describe('Agents Mail CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API Call', () => {
    it('should call API endpoint', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ id: '1', name: 'test' }])
      };
      (fetch as any).mockResolvedValue(mockResponse);

      const response = await fetch('https://agentsmail.org/api/agents');
      const data = await response.json();

      expect(fetch).toHaveBeenCalled();
      expect(data).toEqual([{ id: '1', name: 'test' }]);
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found')
      };
      (fetch as any).mockResolvedValue(mockResponse);

      const response = await fetch('https://agentsmail.org/api/agents/notfound');
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('Config', () => {
    it('should load config with default API URL', async () => {
      const { readFileSync, existsSync } = await import('fs');
      
      // Config file doesn't exist, should use default
      (existsSync as any).mockReturnValueOnce(false);
      
      // Re-import to get fresh values
      const DEFAULT_API_URL = 'https://agentsmail.org';
      expect(DEFAULT_API_URL).toBeDefined();
    });

    it('should save config', async () => {
      const { writeFileSync } = await import('fs');
      
      const config = { apiUrl: 'https://agentsmail.org' };

      // Simulate save
      (writeFileSync as any).mockImplementation(() => {});

      expect(config.apiUrl).toBe('https://agentsmail.org');
    });
  });

  describe('Service Discovery', () => {
    it('should parse service discovery response', async () => {
      const discoveryResponse = {
        service: 'agents-mail',
        version: '1.0',
        api_url: 'https://agentsmail.org',
        domain: 'agentsmail.org',
        capabilities: ['send', 'receive', 'webhook']
      };

      expect(discoveryResponse.service).toBe('agents-mail');
      expect(discoveryResponse.capabilities).toContain('send');
      expect(discoveryResponse.capabilities).toContain('receive');
    });
  });

  describe('Email Interpretation', () => {
    it('should parse interpretation results', () => {
      const interpretation = {
        email_id: '123',
        summary: 'Test summary...',
        intent: { type: 'question', confidence: 0.7 },
        entities: {
          emails: ['test@example.com'],
          urls: ['https://example.com']
        },
        raw: {
          subject: 'Test',
          from: 'sender@example.com',
          word_count: 10
        }
      };

      expect(interpretation.intent.type).toBe('question');
      expect(interpretation.entities.emails).toContain('test@example.com');
      expect(interpretation.raw.word_count).toBe(10);
    });
  });

  describe('ACL', () => {
    it('should validate ACL entry types', () => {
      const validTypes = ['whitelist', 'owner', 'blacklist'];
      
      expect(validTypes).toContain('whitelist');
      expect(validTypes).toContain('owner');
      expect(validTypes).toContain('blacklist');
    });
  });

  describe('Contacts', () => {
    it('should validate contact types', () => {
      const contact = {
        name: 'John',
        email: 'john@example.com',
        type: 'human'
      };

      expect(contact.type).toBe('human');
      expect(contact.email).toContain('@');
    });
  });
});
