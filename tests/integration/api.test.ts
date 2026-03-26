import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration Tests for Agents Mail
 * 
 * These tests make real API calls to verify the complete flow.
 * Run with: npm run test:integration
 */

const API_BASE = 'https://agentsmail.org';
const TEST_AGENT_NAME = 'test-integration';
const TEST_EMAIL = `test-${Date.now()}@example.com`;

// Helper functions
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}

async function createAgent(name: string) {
  const response = await apiCall('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return response.json();
}

async function listAgents() {
  const response = await apiCall('/api/agents');
  return response.json();
}

async function getAgentByName(name: string) {
  const agents = await listAgents();
  return agents.find((a: any) => a.name === name);
}

async function deleteAgent(id: string) {
  // Note: May need admin API for deletion
  console.log(`  (Delete not implemented, agent ${id} remains)`);
}

describe('Agent Mailbox Integration Tests', () => {
  const createdAgentIds: string[] = [];

  afterAll(async () => {
    // Cleanup - would need delete API
    console.log('\nCleanup: Created agents remain in system');
  });

  describe('Agent Management', () => {
    it('should create a new agent', async () => {
      const response = await apiCall('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ name: TEST_AGENT_NAME }),
      });
      const agent = await response.json();
      
      // May succeed or fail if already exists
      if (response.ok) {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('email');
        createdAgentIds.push(agent.id);
      } else {
        // Already exists, that's OK
        expect(agent.error).toContain('exists');
      }
    });

    it('should list all agents', async () => {
      const agents = await listAgents();
      
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should get agent by name', async () => {
      const agent = await getAgentByName(TEST_AGENT_NAME);
      
      expect(agent).toBeDefined();
      expect(agent.name).toBe(TEST_AGENT_NAME);
    });

    it('should detect duplicate agent names', async () => {
      const response = await apiCall('/api/agents', {
        method: 'POST',
        body: JSON.stringify({ name: TEST_AGENT_NAME }),
      });
      
      expect(response.status).toBe(409); // Conflict
    });
  });

  describe('Email Operations', () => {
    let agentId: string;

    beforeAll(async () => {
      const agent = await getAgentByName(TEST_AGENT_NAME);
      agentId = agent.id;
    });

    it('should send an email', async () => {
      const response = await apiCall(`/api/agents/${agentId}/emails`, {
        method: 'POST',
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Integration Test',
          body: 'This is a test email from integration tests',
        }),
      });
      
      const result = await response.json();
      
      expect(response.ok).toBe(true);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('resend_id');
    });

    it('should list emails for agent', async () => {
      const response = await apiCall(`/api/agents/${agentId}/emails`);
      const emails = await response.json();
      
      expect(Array.isArray(emails)).toBe(true);
      // May be empty if no emails yet, that's OK
    });
  });

  describe('Service Discovery', () => {
    it('should return service info', async () => {
      const response = await apiCall('/.well-known/service');
      const info = await response.json();
      
      expect(info).toHaveProperty('service', 'agent-mailbox');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('api_url');
      expect(info.capabilities).toContain('send');
    });
  });

  describe('ACL', () => {
    let agentId: string;

    beforeAll(async () => {
      const agent = await getAgentByName(TEST_AGENT_NAME);
      agentId = agent.id;
    });

    it('should list ACL (empty initially)', async () => {
      const response = await apiCall(`/api/agents/${agentId}/acl`);
      const acl = await response.json();
      
      expect(Array.isArray(acl)).toBe(true);
    });

    it('should add to whitelist', async () => {
      const response = await apiCall(`/api/agents/${agentId}/acl`, {
        method: 'POST',
        body: JSON.stringify({
          email: 'whitelist@example.com',
          type: 'whitelist',
        }),
      });
      
      const result = await response.json();
      expect(response.ok).toBe(true);
      expect(result.email).toBe('whitelist@example.com');
    });

    it('should add to blacklist', async () => {
      const response = await apiCall(`/api/agents/${agentId}/acl`, {
        method: 'POST',
        body: JSON.stringify({
          email: 'blocked@example.com',
          type: 'blacklist',
        }),
      });
      
      const result = await response.json();
      expect(response.ok).toBe(true);
      expect(result.email).toBe('blocked@example.com');
    });
  });

  describe('Contacts', () => {
    let agentId: string;

    beforeAll(async () => {
      const agent = await getAgentByName(TEST_AGENT_NAME);
      agentId = agent.id;
    });

    it('should add a contact', async () => {
      const response = await apiCall(`/api/agents/${agentId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Contact',
          email: 'contact@example.com',
          type: 'human',
        }),
      });
      
      const result = await response.json();
      expect(response.ok).toBe(true);
      expect(result.name).toBe('Test Contact');
    });

    it('should list contacts', async () => {
      const response = await apiCall(`/api/agents/${agentId}/contacts`);
      const contacts = await response.json();
      
      expect(Array.isArray(contacts)).toBe(true);
      expect(contacts.length).toBeGreaterThan(0);
    });
  });

  describe('Email Interpreter', () => {
    let agentId: string;
    let emailId: string;

    beforeAll(async () => {
      const agent = await getAgentByName(TEST_AGENT_NAME);
      agentId = agent.id;
      
      // Get first email
      const response = await apiCall(`/api/agents/${agentId}/emails`);
      const emails = await response.json();
      emailId = emails[0]?.id;
    });

    it('should interpret an email', async () => {
      if (!emailId) {
        console.log('  (No email to interpret)');
        return;
      }
      
      const response = await apiCall(`/api/agents/${agentId}/emails/${emailId}/interpret`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      expect(response.ok).toBe(true);
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('intent');
    });
  });
});
