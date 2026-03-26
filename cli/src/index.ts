#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const program = new Command();

// Config file path
const CONFIG_DIR = join(homedir(), '.agents-mail');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Default API URL
const DEFAULT_API_URL = 'https://agentsmail.org';

interface AgentCredential {
  id: string;
  email: string;
  name: string;
  apiKey: string;
  trustTier: number;
}

interface Config {
  apiUrl: string;
  agents: Record<string, AgentCredential>;
  defaultAgent?: string;
}

// Load config
function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    return { apiUrl: DEFAULT_API_URL, agents: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return { apiUrl: DEFAULT_API_URL, agents: {}, ...raw };
  } catch {
    return { apiUrl: DEFAULT_API_URL, agents: {} };
  }
}

// Save config
function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Resolve agent: by alias, name, or ID
function resolveAgent(config: Config, ref?: string): AgentCredential | null {
  if (!ref) {
    if (config.defaultAgent && config.agents[config.defaultAgent]) {
      return config.agents[config.defaultAgent];
    }
    const keys = Object.keys(config.agents);
    if (keys.length === 1) return config.agents[keys[0]];
    return null;
  }
  // Direct alias match
  if (config.agents[ref]) return config.agents[ref];
  // Match by name or email prefix or ID
  const entry = Object.values(config.agents).find(
    a => a.name === ref || a.email.split('@')[0] === ref || a.id === ref
  );
  return entry || null;
}

// API calls
async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  apiKey?: string
): Promise<any> {
  const config = loadConfig();
  const url = `${config.apiUrl}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  const body = await response.text();
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`API error: ${response.status} - ${body}`);
  }

  if (!response.ok) {
    const msg = json.error?.message || json.error || json.message || body;
    throw new Error(`${json.error?.code || response.status}: ${msg}`);
  }

  return json;
}

// ── Config ──────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('set <key> <value>')
  .description('Set a config value (apiUrl)')
  .action((key: string, value: string) => {
    const config = loadConfig();
    if (key === 'apiUrl' || key === 'API_URL') {
      config.apiUrl = value;
      saveConfig(config);
      console.log(`API URL set to: ${value}`);
    } else {
      console.error(`Unknown config key: ${key}`);
    }
  });

configCmd
  .command('list')
  .description('Show current configuration')
  .action(() => {
    const config = loadConfig();
    console.log(`API URL:  ${config.apiUrl}`);
    console.log(`Agents:   ${Object.keys(config.agents).length} registered`);
    if (config.defaultAgent) {
      console.log(`Default:  ${config.defaultAgent}`);
    }
  });

// ── Discover ────────────────────────────────────────────────

program
  .command('discover')
  .description('Discover and auto-configure Agents Mail service')
  .action(async () => {
    const config = loadConfig();
    const urls = [
      `${config.apiUrl}/.well-known/agents-mail`,
      'https://agentsmail.org/.well-known/agents-mail',
      'http://localhost:8787/.well-known/agents-mail',
    ];

    console.log('Discovering Agents Mail service...\n');

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const info: any = await response.json();
          console.log(`Service:       ${info.service}`);
          console.log(`Version:       ${info.version}`);
          console.log(`API URL:       ${info.api_url}`);
          console.log(`Domain:        ${info.domain}`);
          console.log(`Capabilities:  ${info.capabilities?.join(', ')}`);
          if (info.trust_tiers) {
            console.log('\nTrust Tiers:');
            for (const [tier, detail] of Object.entries(info.trust_tiers) as any) {
              console.log(`  Tier ${tier}: ${detail.name} — ${detail.capabilities.join(', ')}`);
            }
          }
          config.apiUrl = info.api_url;
          saveConfig(config);
          console.log('\nAuto-configured API URL.');
          return;
        }
      } catch {
        // try next
      }
    }
    console.error('Service not found. Using default configuration.');
  });

// ── Register (create agent) ─────────────────────────────────

program
  .command('register')
  .description('Register a new agent mailbox')
  .option('-n, --name <name>', 'Display name (optional)')
  .option('-a, --alias <alias>', 'Local alias for this agent (for CLI convenience)')
  .action(async (options: any) => {
    try {
      const payload: any = {};
      if (options.name) payload.agent_name = options.name;

      const result = await apiCall('/api/getemailaddress', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const alias = options.alias || result.email.split('@')[0];
      const config = loadConfig();
      config.agents[alias] = {
        id: '', // v0.4: not returned, resolved by API key
        email: result.email,
        name: result.agent_name,
        apiKey: result.api_key,
        trustTier: result.tier_level,
      };
      if (Object.keys(config.agents).length === 1) {
        config.defaultAgent = alias;
      }
      saveConfig(config);

      console.log('Mailbox created!\n');
      console.log(`  Alias:       ${alias}`);
      console.log(`  Email:       ${result.email}`);
      console.log(`  Name:        ${result.agent_name}`);
      console.log(`  Tier:        ${result.tier_level}`);
      console.log(`  API Key:     ${result.api_key}`);
      if (result.trial_sends) {
        console.log(`  Trial sends: ${result.trial_sends.remaining}/${result.trial_sends.limit}`);
      }
      console.log('\nCredentials saved to ~/.agents-mail/config.json');
      console.log(`\n${result.IMPORTANT}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Whoami ──────────────────────────────────────────────────

program
  .command('whoami [agent]')
  .description('Show agent details and trust tier')
  .action(async (agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const result = await apiCall('/api/agents', {}, agent.apiKey);
      const info = Array.isArray(result) ? result[0] : result;
      if (!info) {
        console.error('Agent not found');
        return;
      }
      console.log(`Name:        ${info.name}`);
      console.log(`Email:       ${info.email}`);
      console.log(`ID:          ${info.id}`);
      console.log(`Trust Tier:  ${info.trust_tier}`);
      console.log(`Active:      ${info.is_active ? 'Yes' : 'No'}`);
      console.log(`Created:     ${new Date(info.created_at * 1000).toLocaleString()}`);
      // Update local cache
      const alias = Object.entries(config.agents).find(([, v]) => v.apiKey === agent.apiKey)?.[0];
      if (alias) {
        config.agents[alias].trustTier = info.trust_tier;
        config.agents[alias].name = info.name;
        config.agents[alias].email = info.email;
        config.agents[alias].id = info.id;
        saveConfig(config);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Upgrade ─────────────────────────────────────────────────

program
  .command('upgrade [agent]')
  .description('Upgrade to Tier 1 (link owner email + optional custom name)')
  .requiredOption('-e, --email <email>', 'Owner email address')
  .option('-n, --name <name>', 'Custom mailbox name')
  .action(async (agentRef: string | undefined, options: any) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const payload: any = { owner_email: options.email };
      if (options.name) payload.name = options.name;

      const result = await apiCall('/api/upgrade', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, agent.apiKey);

      console.log('Verification email sent!\n');
      console.log(`  To:       ${result.owner_email}`);
      console.log(`  Expires:  ${result.expires_in_seconds}s`);
      if (result.future_email) {
        console.log(`  New email: ${result.future_email}`);
      }
      console.log('\nCheck your email and click the confirmation link.');
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Send Email ──────────────────────────────────────────────

program
  .command('send [agent]')
  .description('Send an email')
  .requiredOption('-t, --to <email>', 'Recipient email')
  .requiredOption('-s, --subject <subject>', 'Email subject')
  .requiredOption('-b, --body <text>', 'Email body (text)')
  .option('--html <html>', 'HTML body (optional)')
  .action(async (agentRef: string | undefined, options: any) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const payload: any = {
        to: options.to,
        subject: options.subject,
        text: options.body,
      };
      if (options.html) {
        payload.html = options.html;
      }

      const result = await apiCall('/api/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, agent.apiKey);

      console.log('Email sent!\n');
      console.log(`  ID:     ${result.id}`);
      console.log(`  From:   ${agent.email}`);
      console.log(`  To:     ${options.to}`);
      if (result.trial_sends) {
        console.log(`  Sends:  ${result.trial_sends.remaining}/${result.trial_sends.limit} remaining`);
      }
      if (result.upgrade_hint) {
        console.log(`\n  ${result.upgrade_hint}`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── List Emails ─────────────────────────────────────────────

program
  .command('inbox [agent]')
  .description('List received emails')
  .option('--unread', 'Show only unread emails')
  .action(async (agentRef: string | undefined, options: any) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      let endpoint = '/api/inbox';
      if (options.unread) endpoint += '?is_read=0';

      const result = await apiCall(endpoint, {}, agent.apiKey);
      const emails = result.emails || result;

      if (!emails.length) {
        console.log('No emails.');
        return;
      }
      console.log(`${emails.length} email(s) for ${agent.email}:\n`);
      for (const email of emails) {
        const status = email.is_read ? '  ' : '*';
        const date = new Date(email.received_at * 1000).toLocaleDateString();
        console.log(`${status} ${date}  ${email.from_address}  ${email.subject || '(no subject)'}`);
        console.log(`  ID: ${email.id}`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

program
  .command('sent [agent]')
  .description('List sent emails')
  .action(async (agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const result = await apiCall('/api/sent', {}, agent.apiKey);
      const emails = result.emails || result;

      if (!emails.length) {
        console.log('No sent emails.');
        return;
      }
      console.log(`${emails.length} sent email(s):\n`);
      for (const email of emails) {
        const date = new Date(email.sent_at * 1000).toLocaleDateString();
        console.log(`  ${date}  → ${email.to_address}  ${email.subject || '(no subject)'}`);
        console.log(`  ID: ${email.id}`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Read Email ──────────────────────────────────────────────

program
  .command('read <emailId> [agent]')
  .description('Read an email')
  .action(async (emailId: string, agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error(agentRef ? `Agent not found: ${agentRef}` : 'No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const email = await apiCall(`/api/inbox/${emailId}`, {}, agent.apiKey);

      console.log(`From:     ${email.from_address}`);
      console.log(`Subject:  ${email.subject || '(no subject)'}`);
      console.log(`Date:     ${new Date(email.received_at * 1000).toLocaleString()}`);
      console.log(`\n${email.body_text || '(no text content)'}`);

      // Mark as read
      if (!email.is_read) {
        try {
          await apiCall(`/api/emails/${emailId}/read`, {
            method: 'PUT',
          }, agent.apiKey);
        } catch {
          // non-critical
        }
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Contacts ────────────────────────────────────────────────

const contactsCmd = program
  .command('contacts')
  .description('Manage contacts');

contactsCmd
  .command('list [agent]')
  .description('List contacts')
  .action(async (agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error('No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const contacts = await apiCall('/api/contacts', {}, agent.apiKey);
      if (!contacts.length) {
        console.log('No contacts.');
        return;
      }
      console.log(`${contacts.length} contact(s):\n`);
      for (const c of contacts) {
        const dir = c.direction ? ` [${c.direction}]` : '';
        console.log(`  ${c.name} <${c.email}> (${c.type})${dir}`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

contactsCmd
  .command('add <name> <email> [agent]')
  .description('Add a contact')
  .option('--type <type>', 'Contact type: agent or human', 'agent')
  .action(async (name: string, email: string, agentRef: string | undefined, options: any) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error('No agent registered. Run: agents-mail register');
      return;
    }
    try {
      await apiCall('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, email, type: options.type }),
      }, agent.apiKey);
      console.log(`Contact added: ${name} <${email}>`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── ACL ─────────────────────────────────────────────────────

const aclCmd = program
  .command('acl')
  .description('Manage allow/block list');

aclCmd
  .command('list [agent]')
  .description('List ACL entries')
  .action(async (agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) {
      console.error('No agent registered. Run: agents-mail register');
      return;
    }
    try {
      const entries = await apiCall('/api/acl', {}, agent.apiKey);
      if (!entries.length) {
        console.log('No ACL entries — all senders allowed.');
        return;
      }
      for (const e of entries) {
        console.log(`  [${e.type}] ${e.email}`);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

aclCmd
  .command('allow <email> [agent]')
  .description('Allow an email address')
  .action(async (email: string, agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) { console.error('No agent registered.'); return; }
    try {
      await apiCall('/api/acl', {
        method: 'POST',
        body: JSON.stringify({ email, type: 'whitelist' }),
      }, agent.apiKey);
      console.log(`Allowed: ${email}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

aclCmd
  .command('block <email> [agent]')
  .description('Block an email address')
  .action(async (email: string, agentRef?: string) => {
    const config = loadConfig();
    const agent = resolveAgent(config, agentRef);
    if (!agent) { console.error('No agent registered.'); return; }
    try {
      await apiCall('/api/acl', {
        method: 'POST',
        body: JSON.stringify({ email, type: 'blacklist' }),
      }, agent.apiKey);
      console.log(`Blocked: ${email}`);
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  });

// ── Agents List ─────────────────────────────────────────────

program
  .command('agents')
  .description('List locally registered agents')
  .action(() => {
    const config = loadConfig();
    const entries = Object.entries(config.agents);
    if (!entries.length) {
      console.log('No agents registered. Run: agents-mail register');
      return;
    }
    console.log(`${entries.length} agent(s):\n`);
    for (const [alias, agent] of entries) {
      const def = config.defaultAgent === alias ? ' (default)' : '';
      console.log(`  ${alias}${def}`);
      console.log(`    Email:  ${agent.email}`);
      console.log(`    Tier:   ${agent.trustTier}`);
    }
  });

program
  .command('use <alias>')
  .description('Set default agent')
  .action((alias: string) => {
    const config = loadConfig();
    if (!config.agents[alias]) {
      console.error(`Agent not found: ${alias}. Run: agents-mail agents`);
      return;
    }
    config.defaultAgent = alias;
    saveConfig(config);
    console.log(`Default agent set to: ${alias}`);
  });

// ── Version & Parse ─────────────────────────────────────────

program
  .version('0.4.0')
  .description('Agents Mail CLI — Email service for AI agents\n\nhttps://agentsmail.org');

program.parse();
