export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  DOMAIN: string;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  WEB_APP_URL?: string;
  ADMIN_APP_URL?: string;
  ENCRYPTION_KEY?: string;
  RECEIPT_HMAC_KEY?: string;
  DEV_MODE?: string;
}

/** Agent record returned by resolveAgentFromAuth (v0.4). */
export interface AgentRecord {
  id: string;
  email: string;
  name: string;
  trust_tier: number;
  owner_id: string | null;
}
