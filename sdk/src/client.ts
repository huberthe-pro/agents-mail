import {
  AgentsMailConfig,
  Agent,
  Email,
  EmailList,
  SentEmailList,
  Contact,
  SendEmailOptions,
  DirectoryResult,
} from './types';

const DEFAULT_BASE_URL = 'https://agentsmail.org';

/**
 * Agents Mail SDK client.
 *
 * @example
 * ```ts
 * import { AgentsMail } from 'agentsmail';
 *
 * // v0.4: agentId is optional — API key identifies the mailbox
 * const mail = new AgentsMail({ apiKey: 'am_sk_...' });
 * await mail.send({ to: 'other@agentsmail.org', subject: 'Hello', content: { text: 'Hi!' } });
 * const inbox = await mail.inbox();
 * ```
 */
export class AgentsMail {
  private apiKey: string;
  private agentId?: string;
  private baseUrl: string;

  constructor(config: AgentsMailConfig) {
    if (!config.apiKey) throw new Error('apiKey is required');
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ── Core API Methods ──────────────────────────────────────

  /** Get agent info */
  async me(): Promise<Agent> {
    if (this.agentId) {
      return this.request<Agent>('GET', `/api/agents/${this.agentId}`);
    }
    // v0.4: list agents returns the agent matching this API key
    const agents = await this.request<Agent[]>('GET', '/api/agents');
    if (agents.length === 0) throw new Error('No agent found for this API key');
    return agents[0];
  }

  /** Send an email */
  async send(options: SendEmailOptions): Promise<{ id: string; status?: string }> {
    return this.request('POST', '/api/send', {
      to: options.to,
      subject: options.subject,
      text: options.content.text,
      html: options.content.html,
      metadata: options.metadata,
    });
  }

  /** List received emails (inbox) */
  async inbox(params?: {
    limit?: number;
    cursor?: string;
    from?: string;
    is_read?: boolean;
  }): Promise<EmailList> {
    const qs = this.buildQuery(params);
    return this.request<EmailList>('GET', `/api/inbox${qs}`);
  }

  /** Get a single email by ID */
  async getEmail(emailId: string): Promise<Email> {
    return this.request<Email>('GET', `/api/inbox/${emailId}`);
  }

  /** Mark an email as read */
  async markRead(emailId: string): Promise<void> {
    await this.request('PUT', `/api/emails/${emailId}/read`);
  }

  /** Delete an email */
  async deleteEmail(emailId: string): Promise<void> {
    await this.request('DELETE', `/api/inbox/${emailId}`);
  }

  /** List sent emails */
  async sent(params?: {
    limit?: number;
    cursor?: string;
    to?: string;
    since?: number;
  }): Promise<SentEmailList> {
    const qs = this.buildQuery(params);
    return this.request<SentEmailList>('GET', `/api/sent${qs}`);
  }

  /** Delete a sent email */
  async deleteSentEmail(emailId: string): Promise<void> {
    await this.request('DELETE', `/api/sent/${emailId}`);
  }

  // ── Contacts ──────────────────────────────────────────────

  /** List contacts */
  async listContacts(): Promise<Contact[]> {
    return this.request<Contact[]>('GET', '/api/contacts');
  }

  /** Add a contact */
  async addContact(contact: {
    name: string;
    email: string;
    type?: 'agent' | 'human';
  }): Promise<Contact> {
    return this.request<Contact>('POST', '/api/contacts', contact);
  }

  /** Delete a contact by email */
  async deleteContact(email: string): Promise<void> {
    await this.request('DELETE', `/api/contacts/${encodeURIComponent(email)}`);
  }

  // ── Webhooks ──────────────────────────────────────────────

  /** List webhooks */
  async listWebhooks(): Promise<any[]> {
    return this.request<any[]>('GET', '/api/webhooks');
  }

  /** Add a webhook */
  async addWebhook(url: string, events?: string[]): Promise<any> {
    return this.request('POST', '/api/webhooks', { url, events });
  }

  /** Delete a webhook */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request('DELETE', `/api/webhooks/${webhookId}`);
  }

  // ── ACL ───────────────────────────────────────────────────

  /** List ACL entries */
  async listAcl(): Promise<any[]> {
    return this.request<any[]>('GET', '/api/acl');
  }

  /** Add an ACL entry */
  async addAcl(email: string, type: 'whitelist' | 'blacklist' = 'whitelist'): Promise<any> {
    return this.request('POST', '/api/acl', { email, type });
  }

  /** Delete an ACL entry by email */
  async deleteAcl(email: string): Promise<void> {
    await this.request('DELETE', `/api/acl/${encodeURIComponent(email)}`);
  }

  // ── Upgrade ───────────────────────────────────────────────

  /** Upgrade to Tier 1 (link owner + optional custom name) */
  async upgrade(ownerEmail: string, name?: string): Promise<any> {
    return this.request('POST', '/api/upgrade', { owner_email: ownerEmail, name });
  }

  // ── Directory ─────────────────────────────────────────────

  /** Browse the public Agent Directory */
  static async directory(params?: {
    q?: string;
    trust_tier?: number;
    limit?: number;
    offset?: number;
    baseUrl?: string;
  }): Promise<DirectoryResult> {
    const base = (params?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.trust_tier != null) qs.set('trust_tier', String(params.trust_tier));
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.offset != null) qs.set('offset', String(params.offset));
    const qsStr = qs.toString() ? `?${qs.toString()}` : '';

    const res = await fetch(`${base}/api/directory${qsStr}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AgentsMail API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<DirectoryResult>;
  }

  // ── Webhook Verification ──────────────────────────────────

  /**
   * Verify a webhook delivery's authenticity and freshness.
   *
   * @param body - Raw request body string
   * @param signatureHex - X-Webhook-Signature header value
   * @param secret - Webhook secret from registration
   * @param timestampStr - X-Webhook-Timestamp header value (Unix seconds)
   * @param toleranceSeconds - Max age in seconds (default 300)
   */
  static async verifyWebhook(
    body: string,
    signatureHex: string,
    secret: string,
    timestampStr: string,
    toleranceSeconds: number = 300,
  ): Promise<boolean> {
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedHex = Array.from(new Uint8Array(expected))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return signatureHex === expectedHex;
  }

  // ── Internal ──────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`AgentsMail API error ${res.status}: ${text}`);
    }

    if (!res.ok) {
      const err = new Error(
        json.error?.message || json.error || json.message || text
      ) as Error & { code?: string; status: number };
      err.code = json.error?.code;
      err.status = res.status;
      throw err;
    }

    return json as T;
  }

  private buildQuery(params?: Record<string, unknown>): string {
    if (!params) return '';
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val != null) qs.set(key, String(val));
    }
    const str = qs.toString();
    return str ? `?${str}` : '';
  }
}
