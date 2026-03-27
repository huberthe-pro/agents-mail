import { Env, AgentRecord } from '../types';
import { generateId, jsonResponse, nowUnix, v4Response } from '../utils';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB per email total

/**
 * GET /api/attachments/:attachmentId
 * Download an attachment file from R2.
 */
export async function handleDownloadAttachment(
  request: Request,
  env: Env,
  params: Record<string, string>,
  agent: AgentRecord
): Promise<Response> {
  const { attachmentId } = params;

  // Verify attachment belongs to this agent
  const attachment = await env.DB.prepare(
    'SELECT id, email_id, agent_id, filename, mime_type, size, r2_key FROM attachments WHERE id = ?'
  ).bind(attachmentId).first() as any;

  if (!attachment || attachment.agent_id !== agent.id) {
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } }, 404);
  }

  // Fetch from R2
  const object = await env.ATTACHMENTS.get(attachment.r2_key);
  if (!object) {
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Attachment file not found in storage' } }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `attachment; filename="${attachment.filename}"`,
      'Content-Length': String(attachment.size),
    },
  });
}

/**
 * Store inbound attachments from parsed email.
 * Called by email-worker after postal-mime parsing.
 */
export async function storeInboundAttachments(
  env: Env,
  agentId: string,
  emailId: string,
  attachments: Array<{ filename: string | null; mimeType: string; content: ArrayBuffer | string; }>
): Promise<Array<{ id: string; filename: string; mime_type: string; size: number }>> {
  const stored: Array<{ id: string; filename: string; mime_type: string; size: number }> = [];
  let totalSize = 0;

  for (const att of attachments) {
    const content = att.content instanceof ArrayBuffer
      ? att.content
      : new TextEncoder().encode(att.content as string).buffer;

    const size = content.byteLength;
    totalSize += size;

    // Skip if over total limit
    if (totalSize > MAX_ATTACHMENT_SIZE) {
      console.log(`Attachment skipped: total size ${totalSize} exceeds ${MAX_ATTACHMENT_SIZE}`);
      break;
    }

    const id = `att_${generateId()}`;
    const filename = att.filename || `attachment_${stored.length + 1}`;
    const r2Key = `${agentId}/${emailId}/${filename}`;

    // Upload to R2
    await env.ATTACHMENTS.put(r2Key, content, {
      httpMetadata: { contentType: att.mimeType },
    });

    // Write metadata to DB
    await env.DB.prepare(
      'INSERT INTO attachments (id, email_id, agent_id, filename, mime_type, size, r2_key, direction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, emailId, agentId, filename, att.mimeType, size, r2Key, 'inbound', nowUnix()).run();

    stored.push({ id, filename, mime_type: att.mimeType, size });
  }

  return stored;
}

/**
 * Store outbound attachments from send request.
 */
export async function storeOutboundAttachments(
  env: Env,
  agentId: string,
  emailId: string,
  attachments: Array<{ filename: string; content: string; content_type: string }>
): Promise<Array<{ id: string; filename: string; content_type: string; size: number }>> {
  const stored: Array<{ id: string; filename: string; content_type: string; size: number }> = [];
  let totalSize = 0;

  for (const att of attachments) {
    // Decode base64
    const binary = Uint8Array.from(atob(att.content), c => c.charCodeAt(0));
    const size = binary.byteLength;
    totalSize += size;

    if (totalSize > MAX_ATTACHMENT_SIZE) {
      throw new Error(`Total attachment size exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit`);
    }

    const id = `att_${generateId()}`;
    const r2Key = `${agentId}/${emailId}/${att.filename}`;

    // Upload to R2
    await env.ATTACHMENTS.put(r2Key, binary, {
      httpMetadata: { contentType: att.content_type },
    });

    // Write metadata to DB
    await env.DB.prepare(
      'INSERT INTO attachments (id, email_id, agent_id, filename, mime_type, size, r2_key, direction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, emailId, agentId, att.filename, att.content_type, size, r2Key, 'outbound', nowUnix()).run();

    stored.push({ id, filename: att.filename, content_type: att.content_type, size });
  }

  return stored;
}

/**
 * Get attachment metadata for an email.
 */
export async function getAttachmentsForEmail(
  env: Env,
  emailId: string,
  domain: string
): Promise<Array<{ id: string; filename: string; mime_type: string; size: number; download_url: string }>> {
  const { results } = await env.DB.prepare(
    'SELECT id, filename, mime_type, size FROM attachments WHERE email_id = ? ORDER BY created_at'
  ).bind(emailId).all();

  return (results || []).map((att: any) => ({
    id: att.id,
    filename: att.filename,
    mime_type: att.mime_type,
    size: att.size,
    download_url: `https://${domain}/api/attachments/${att.id}`,
  }));
}

/**
 * Delete all attachments for an email (R2 + DB).
 */
export async function deleteAttachmentsForEmail(
  env: Env,
  emailId: string
): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT r2_key FROM attachments WHERE email_id = ?'
  ).bind(emailId).all();

  // Delete from R2
  for (const row of (results || [])) {
    await env.ATTACHMENTS.delete((row as any).r2_key);
  }

  // Delete from DB
  await env.DB.prepare('DELETE FROM attachments WHERE email_id = ?').bind(emailId).run();

  return (results || []).length;
}

/** Validate attachment size before processing */
export function validateAttachmentSize(attachments: Array<{ content: string }>): void {
  let totalSize = 0;
  for (const att of attachments) {
    // base64 is ~33% larger than binary
    const estimatedSize = Math.ceil(att.content.length * 0.75);
    totalSize += estimatedSize;
  }
  if (totalSize > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Total attachment size exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit`);
  }
}
