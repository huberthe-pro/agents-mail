import { Env } from '../types';
import { nowUnix } from '../utils';

const UNREAD_TTL = 7 * 24 * 60 * 60; // 7 days
const READ_TTL = 7 * 24 * 60 * 60; // 7 days
const BATCH_SIZE = 100;

/**
 * Auto-destroy email content based on lifecycle rules:
 * - unread for 7 days → destroy content
 * - read (not deleted) for 7 days → destroy content
 */
export async function handleAutoDestroy(env: Env): Promise<number> {
  const { DB } = env;
  const now = nowUnix();
  let totalDestroyed = 0;

  // Destroy unread emails older than 7 days
  const unreadCutoff = now - UNREAD_TTL;
  const unreadResult = await DB.prepare(`
    UPDATE emails SET
      body_text = NULL, body_html = NULL,
      encryption_iv = NULL, is_encrypted = 0,
      status = 'destroyed', status_updated_at = ?,
      content_destroyed_at = ?
    WHERE status = 'unread' AND status_updated_at IS NOT NULL AND status_updated_at < ?
    LIMIT ?
  `).bind(now, now, unreadCutoff, BATCH_SIZE).run();
  totalDestroyed += unreadResult.meta?.changes || 0;

  // Destroy read emails older than 7 days
  const readCutoff = now - READ_TTL;
  const readResult = await DB.prepare(`
    UPDATE emails SET
      body_text = NULL, body_html = NULL,
      encryption_iv = NULL, is_encrypted = 0,
      status = 'destroyed', status_updated_at = ?,
      content_destroyed_at = ?
    WHERE status = 'read' AND status_updated_at IS NOT NULL AND status_updated_at < ?
    LIMIT ?
  `).bind(now, now, readCutoff, BATCH_SIZE).run();
  totalDestroyed += readResult.meta?.changes || 0;

  if (totalDestroyed > 0) {
    console.log(`Auto-destroy: ${totalDestroyed} email(s) content destroyed`);
  }

  return totalDestroyed;
}
