/**
 * Agents Mail - Email Worker
 * Receives emails from Cloudflare Email Routing, writes directly to D1.
 */

import { buildPreviewText, normalizeInboundText, sanitizeHtml, sha256Hex } from './src/mail';
import { deliverWebhooks } from './src/handlers/webhooks';
import { writeEmailEvent } from './src/email-events';
import { generateId } from './src/utils';
import { upsertContactDirection } from './src/contact-graph';
import { maybeUpgradeTier } from './src/trust-tiers';
import { encryptEmailFields } from './src/encryption';
import type { Env } from './src/types';

interface EmailMessage {
  from: string;
  to: string;
  headers: Headers;
  text?: (() => Promise<string>) | string;
  html?: (() => Promise<string>) | string;
  raw?: () => Promise<ArrayBuffer>;
  setReject: (reason: string) => void;
}

export default {
  async email(message: EmailMessage, env: Env) {
    const { DB, DOMAIN } = env;

    try {
      const from = message.from;
      const to = message.to;
      const subject = message.headers.get('subject') || '';
      const messageId = message.headers.get('message-id') || message.headers.get('Message-ID') || null;

      let rawText = '';
      let rawHtml = '';

      try {
        if (typeof message.text === 'function') rawText = await message.text();
      } catch (e) {
        console.log('Could not read text body:', (e as Error).message);
      }

      try {
        if (typeof message.html === 'function') rawHtml = await message.html();
      } catch (e) {
        console.log('Could not read html body:', (e as Error).message);
      }

      console.log('Received email:', { from, to, subject });

      // Parse "Name <email>" format
      let fromAddress = from;
      let fromName = '';
      const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
      if (fromMatch) {
        fromName = fromMatch[1].trim().replace(/^"|"$/g, '');
        fromAddress = fromMatch[2].trim();
      }

      // Extract agent name from to address
      const toMatch = to.match(/^([^@]+)@(.+)$/);
      if (!toMatch) {
        message.setReject('Invalid recipient address');
        return;
      }

      const agentName = toMatch[1].toLowerCase();
      const domain = toMatch[2].toLowerCase();

      if (domain !== DOMAIN) {
        message.setReject('Unknown domain');
        return;
      }

      // Look up agent by email address (supports random slug addresses)
      const agentEmail = `${agentName}@${DOMAIN}`;
      const { results: agents } = await DB.prepare(
        'SELECT id, name FROM agents WHERE email = ? AND is_active = 1'
      ).bind(agentEmail).all();

      if (agents.length === 0) {
        console.log('Agent not found:', agentName);
        message.setReject('Recipient not found');
        return;
      }

      const agent = agents[0] as any;

      // ACL check
      const { results: acl } = await DB.prepare(
        'SELECT type FROM acl WHERE agent_id = ? AND email = ?'
      ).bind(agent.id, fromAddress).all();

      if (acl.length > 0) {
        if ((acl[0] as any).type === 'blacklist') {
          console.log('Blocked from blacklisted sender:', fromAddress);
          message.setReject('Sender blocked');
          return;
        }
      } else {
        const { results: allAcl } = await DB.prepare(
          'SELECT COUNT(*) as count FROM acl WHERE agent_id = ?'
        ).bind(agent.id).all();
        if ((allAcl[0] as any).count > 0) {
          console.log('Rejected — not in whitelist:', fromAddress);
          message.setReject('Sender not in whitelist');
          return;
        }
      }

      // Sanitize and normalize body
      const sanitizedHtml = rawHtml ? sanitizeHtml(rawHtml) : null;
      const bodyText = normalizeInboundText(rawText, sanitizedHtml || rawHtml);
      const contentFingerprint = await sha256Hex([fromAddress, to, subject, bodyText].join('\n'));

      // Deduplicate
      const dupResult = messageId
        ? await DB.prepare('SELECT id FROM emails WHERE agent_id = ? AND message_id = ?').bind(agent.id, messageId).all()
        : await DB.prepare('SELECT id FROM emails WHERE agent_id = ? AND message_id IS NULL AND content_fingerprint = ?').bind(agent.id, contentFingerprint).all();

      if (dupResult.results.length > 0) {
        const dupId = (dupResult.results[0] as any).id;
        await writeEmailEvent(env, agent.id, 'inbound', 'duplicate', dupId, { from: fromAddress, subject });
        console.log('Duplicate email, skipping:', dupId);
        return;
      }

      // Encrypt and store email
      const emailId = generateId();
      const receivedAt = Math.floor(Date.now() / 1000);
      const encrypted = await encryptEmailFields(env, bodyText, sanitizedHtml);
      await DB.prepare(`
        INSERT INTO emails (id, agent_id, from_address, from_name, subject, body_text, body_html, source, message_id, content_fingerprint,
                            is_encrypted, encryption_iv, encryption_version,
                            status, status_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?)
      `).bind(
        emailId, agent.id, fromAddress, fromName || null,
        subject, encrypted.body_text, encrypted.body_html, 'email-worker', messageId, contentFingerprint,
        encrypted.is_encrypted, encrypted.encryption_iv, encrypted.encryption_version,
        receivedAt
      ).run();

      // Update last activity timestamp
      DB.prepare('UPDATE agents SET last_activity_at = ? WHERE id = ?')
        .bind(receivedAt, agent.id).run().catch(() => {});

      console.log('Email stored:', emailId);

      await writeEmailEvent(env, agent.id, 'inbound', 'received', emailId, {
        from: fromAddress,
        subject,
        has_html: Boolean(sanitizedHtml),
      });

      // Auto-create/upgrade inbound contact, trigger tier upgrade if mutual
      upsertContactDirection(env, agent.id, fromAddress, fromName || '', 'inbound')
        .then(result => { if (result.upgraded) maybeUpgradeTier(env, agent.id).catch(console.error); })
        .catch(err => console.error('Contact graph update failed:', err));

      deliverWebhooks(env, agent.id, 'email.received', {
        email_id: emailId,
        from: fromAddress,
        from_name: fromName || null,
        subject,
        preview_text: buildPreviewText(bodyText),
      }).catch(err => console.error('Webhook delivery error:', err));

    } catch (error) {
      console.error('Error processing email:', error);
      message.setReject('Internal error');
    }
  },
};
