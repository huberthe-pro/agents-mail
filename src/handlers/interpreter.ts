import { Env } from '../types';
import { jsonResponse } from '../utils';
import { decryptEmailFields } from '../encryption';

export async function handleInterpretEmail(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const { DB } = env;
  const agentId = params.agentId;
  const emailId = params.emailId;

  // Get email
  const { results: emails } = await DB.prepare(
    'SELECT subject, body_text, from_address, is_encrypted, encryption_iv FROM emails WHERE id = ? AND agent_id = ?'
  ).bind(emailId, agentId).all();

  if (emails.length === 0) {
    return jsonResponse({ error: 'Email not found' }, 404);
  }

  const email = emails[0] as any;
  const decrypted = await decryptEmailFields(env, email);

  // Simple interpretation (MVP - keyword-based)
  const subject = email.subject || '';
  const body = decrypted.body_text || '';
  const from = email.from_address || '';
  const fullText = `${subject} ${body}`.toLowerCase();

  // Detect intent (simple keyword matching)
  const intents = [];
  if (fullText.includes('urgent') || fullText.includes('asap') || fullText.includes('immediately')) {
    intents.push({ type: 'urgent', confidence: 0.8 });
  }
  if (fullText.includes('question') || fullText.includes('?') || fullText.includes('how') || fullText.includes('what')) {
    intents.push({ type: 'question', confidence: 0.7 });
  }
  if (fullText.includes('request') || fullText.includes('please')) {
    intents.push({ type: 'request', confidence: 0.6 });
  }
  if (fullText.includes('thank') || fullText.includes('thanks')) {
    intents.push({ type: 'acknowledgment', confidence: 0.7 });
  }
  if (fullText.includes('meeting') || fullText.includes('schedule') || fullText.includes('call')) {
    intents.push({ type: 'meeting', confidence: 0.6 });
  }
  if (intents.length === 0) {
    intents.push({ type: 'general', confidence: 0.5 });
  }

  // Extract entities
  const entities: Record<string, string[]> = {
    emails: [],
    urls: [],
  };

  // Extract emails from text
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const foundEmails = (subject + ' ' + body).match(emailRegex) || [];
  entities.emails = [...new Set(foundEmails)];

  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  const foundUrls = (subject + ' ' + body).match(urlRegex) || [];
  entities.urls = [...new Set(foundUrls)];

  // Generate summary (first 100 chars)
  const summary = (subject + ' ' + body).substring(0, 100).trim() + '...';

  return jsonResponse({
    email_id: emailId,
    summary,
    intent: intents.sort((a: any, b: any) => b.confidence - a.confidence)[0],
    all_intents: intents,
    entities,
    raw: {
      subject: email.subject,
      from: email.from_address,
      word_count: (subject + ' ' + body).split(/\s+/).length,
    }
  });
}
