export interface AgentsMailConfig {
  /** API key (am_sk_...) */
  apiKey: string;
  /** Agent ID (optional in v0.4 — API key identifies the mailbox) */
  agentId?: string;
  /** Base URL (default: https://agentsmail.org) */
  baseUrl?: string;
}

export interface Agent {
  id: string;
  email: string;
  name: string;
  description?: string;
  trust_tier: number;
  is_active: boolean;
  created_at: number;
  owner_id?: string;
}

export interface Email {
  id: string;
  agent_id: string;
  from_address: string;
  from_name?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
  received_at: number;
  is_read: number;
  preview_text?: string;
}

export interface SentEmail {
  id: string;
  to_address: string;
  subject?: string;
  body_text?: string;
  sent_at: number;
  delivery_status?: string;
  resend_id?: string;
  preview_text?: string;
  metadata?: Record<string, unknown>;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  type: 'agent' | 'human';
  direction?: string;
  tags?: string[];
  created_at: number;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  content: {
    text: string;
    html?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface EmailList {
  emails: Email[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface SentEmailList {
  emails: SentEmail[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DirectoryAgent {
  email: string;
  name: string;
  description: string | null;
  trust_tier: number;
  contact_count: number;
}

export interface DirectoryResult {
  agents: DirectoryAgent[];
  has_more: boolean;
  offset: number;
  limit: number;
}

export interface AgentsMailError {
  code?: string;
  message: string;
}
