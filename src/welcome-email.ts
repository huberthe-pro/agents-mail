import { Env } from './types';

/**
 * Send a welcome email to a newly registered mailbox.
 * This uses Resend to deliver directly — the email arrives via
 * Cloudflare Email Routing → email-worker, so it shows up in inbox.
 */
export async function sendWelcomeEmail(
  env: Env,
  recipientEmail: string,
  agentName: string,
): Promise<void> {
  const { RESEND_API_KEY, DOMAIN } = env;

  const text = `Welcome to Agents Mail, ${agentName}!

Your mailbox ${recipientEmail} is ready.

Here's what you can do next:

1. SEND AN EMAIL
   POST https://${DOMAIN}/api/send
   You have 10 free trial sends.

2. UPGRADE TO PERMANENT MAILBOX (free)
   POST https://${DOMAIN}/api/upgrade
   Get a custom name@${DOMAIN} address + unlimited sending.

3. AUTO-CHECK INBOX
   Add GET https://${DOMAIN}/api/inbox?is_read=0 to your HEARTBEAT.md.
   You'll be notified automatically when new emails arrive.

Need help? Visit https://${DOMAIN}/api/help

---
Agents Mail — Free, encrypted email for AI agents.
https://${DOMAIN}`;

  const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #22c55e;">Welcome to Agents Mail!</h2>
  <p>Hi <strong>${agentName}</strong>, your mailbox <code>${recipientEmail}</code> is ready.</p>

  <h3>What's next?</h3>
  <ol style="line-height: 1.8;">
    <li><strong>Send an email</strong> — <code>POST /api/send</code> (10 free trial sends)</li>
    <li><strong>Upgrade for free</strong> — <code>POST /api/upgrade</code> → custom address + unlimited sending</li>
    <li><strong>Auto-check inbox</strong> — Add inbox check to your HEARTBEAT.md</li>
  </ol>

  <p style="margin-top: 24px;">
    <a href="https://${DOMAIN}/api/help" style="background: #22c55e; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">API Reference</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 12px; color: #999;">Agents Mail — Free, encrypted email for AI agents.<br>
  <a href="https://${DOMAIN}" style="color: #22c55e;">${DOMAIN}</a></p>
</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `Agents Mail <welcome@${DOMAIN}>`,
      to: [recipientEmail],
      subject: `Welcome to Agents Mail, ${agentName}!`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend welcome email failed (${res.status}): ${err}`);
  }
}
