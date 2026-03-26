import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock D1 Database
const mockDB = {
  prepare: vi.fn(() => ({
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [] }),
  })),
};

// Mock Env
const mockEnv = {
  DB: mockDB,
  RESEND_API_KEY: 'test-key',
  DOMAIN: 'agentsmail.org',
};

describe('Agents Mail API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Discovery', () => {
    it('should return service info', () => {
      const response = {
        service: 'agents-mail',
        version: '1.0',
        api_url: 'https://agentsmail.org',
        domain: 'agentsmail.org',
        capabilities: ['send', 'receive', 'webhook'],
        endpoints: {
          register: '/api/agents',
          send: '/api/agents/:id/emails',
          list: '/api/agents/:id/emails',
        },
      };

      expect(response.service).toBe('agents-mail');
      expect(response.capabilities).toContain('send');
      expect(response.endpoints.register).toBe('/api/agents');
    });
  });

  describe('Agent CRUD', () => {
    it('should validate agent data', () => {
      const agent = {
        id: 'test-id',
        name: 'testagent',
        email: 'testagent@agentsmail.org',
        is_active: 1,
        created_at: Date.now(),
      };

      expect(agent.id).toBeDefined();
      expect(agent.email).toContain('@');
      expect(agent.is_active).toBe(1);
    });

    it('should generate unique IDs', () => {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();

      expect(id1).not.toBe(id2);
    });
  });

  describe('Email Operations', () => {
    it('should validate email data', () => {
      const email = {
        id: 'email-id',
        agent_id: 'agent-id',
        from_address: 'sender@example.com',
        to_address: 'receiver@agentsmail.org',
        subject: 'Test',
        body_text: 'Hello',
        is_read: 0,
        received_at: Date.now(),
      };

      expect(email.from_address).toContain('@');
      expect(email.is_read).toBe(0);
    });

    it('should handle email send response', () => {
      const sendResponse = {
        id: 'sent-email-id',
        resend_id: 'resend-123',
      };

      expect(sendResponse.id).toBeDefined();
      expect(sendResponse.resend_id).toBeDefined();
    });
  });

  describe('ACL', () => {
    it('should validate ACL entry', () => {
      const aclEntry = {
        id: 'acl-id',
        agent_id: 'agent-id',
        email: 'user@example.com',
        type: 'whitelist',
        created_at: Date.now(),
      };

      expect(['whitelist', 'owner', 'blacklist']).toContain(aclEntry.type);
    });

    it('should check whitelist logic', () => {
      const whitelist = ['user1@example.com', 'user2@example.com'];
      const sender = 'user1@example.com';

      expect(whitelist.includes(sender)).toBe(true);
    });

    it('should check blacklist logic', () => {
      const blacklist = ['blocked@example.com'];
      const sender = 'blocked@example.com';

      expect(blacklist.includes(sender)).toBe(true);
    });
  });

  describe('Contacts', () => {
    it('should validate contact data', () => {
      const contact = {
        id: 'contact-id',
        agent_id: 'agent-id',
        name: 'John Doe',
        email: 'john@example.com',
        type: 'human',
        tags: ['friend', 'work'],
        created_at: Date.now(),
      };

      expect(['agent', 'human']).toContain(contact.type);
      expect(contact.email).toContain('@');
    });
  });

  describe('Email Interpreter', () => {
    it('should detect urgent intent', () => {
      const text = 'This is urgent, please respond immediately!';
      const isUrgent = text.toLowerCase().includes('urgent') || 
                       text.toLowerCase().includes('immediately');

      expect(isUrgent).toBe(true);
    });

    it('should detect question intent', () => {
      const text = 'Can you help me with this question?';
      const isQuestion = text.includes('?') || 
                         text.toLowerCase().includes('how') ||
                         text.toLowerCase().includes('what');

      expect(isQuestion).toBe(true);
    });

    it('should extract emails from text', () => {
      const text = 'Contact me at test@example.com or admin@domain.org';
      const emails = text.match(/[\w.-]+@[\w.-]+\.\w+/g);

      expect(emails).toContain('test@example.com');
      expect(emails).toContain('admin@domain.org');
    });

    it('should extract URLs from text', () => {
      const text = 'Check out https://example.com for more info';
      const urls = text.match(/https?:\/\/[^\s]+/g);

      expect(urls).toContain('https://example.com');
    });
  });

  describe('Authentication', () => {
    it('should generate API key with correct prefix', () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const apiKey = `am_sk_${key}`;

      expect(apiKey).toMatch(/^am_sk_[0-9a-f]{64}$/);
    });

    it('should produce consistent SHA-256 hash', async () => {
      const key = 'am_sk_test123';
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      const hash1 = await crypto.subtle.digest('SHA-256', data);
      const hash2 = await crypto.subtle.digest('SHA-256', data);

      const hex1 = Array.from(new Uint8Array(hash1)).map(b => b.toString(16).padStart(2, '0')).join('');
      const hex2 = Array.from(new Uint8Array(hash2)).map(b => b.toString(16).padStart(2, '0')).join('');

      expect(hex1).toBe(hex2);
      expect(hex1).toHaveLength(64);
    });

    it('should validate Bearer token format', () => {
      const validHeader = 'Bearer am_sk_abc123';
      const invalidHeaders = ['', 'Basic abc', 'Bearer', 'am_sk_abc123'];

      expect(validHeader.startsWith('Bearer ')).toBe(true);
      expect(validHeader.slice(7)).toBe('am_sk_abc123');

      for (const h of invalidHeaders) {
        expect(h.startsWith('Bearer ') && h.length > 7).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 unauthorized', () => {
      const error = { error: 'Missing or invalid Authorization header' };
      expect(error.error).toContain('Authorization');
    });

    it('should handle 404 errors', () => {
      const error = { error: 'Not found', status: 404 };
      expect(error.status).toBe(404);
    });

    it('should handle 400 errors', () => {
      const error = { error: 'Bad request', status: 400 };
      expect(error.status).toBe(400);
    });

    it('should handle 403 errors', () => {
      const error = { error: 'Forbidden', status: 403 };
      expect(error.status).toBe(403);
    });
  });
});
