import { Env } from './types';

/**
 * AES-256-GCM encryption module for email content at rest.
 * Uses Web Crypto API (crypto.subtle) available in Workers runtime.
 */

export interface EncryptedFields {
  body_text: string | null;
  body_html: string | null;
  is_encrypted: number;
  encryption_iv: string | null;
  encryption_version: number;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(hexKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

async function decrypt(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt email body fields. If ENCRYPTION_KEY is not set, returns plaintext (dev mode).
 */
export async function encryptEmailFields(
  env: Env,
  bodyText: string | null,
  bodyHtml: string | null,
): Promise<EncryptedFields> {
  if (!env.ENCRYPTION_KEY || (!bodyText && !bodyHtml)) {
    return { body_text: bodyText, body_html: bodyHtml, is_encrypted: 0, encryption_iv: null, encryption_version: 1 };
  }

  const key = await importKey(env.ENCRYPTION_KEY);
  // Use same IV for both fields of the same email
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBase64 = bytesToBase64(iv);

  const encText = bodyText
    ? bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(bodyText))))
    : null;
  const encHtml = bodyHtml
    ? bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) }, key, new TextEncoder().encode(bodyHtml))))
    : null;

  // Actually, use separate IVs for text and html but store as combined
  // Simpler: encrypt concatenated, but that complicates partial reads
  // Simplest: share one IV, encrypt each field separately with unique IVs
  // Let's use a single IV for body_text and a derived IV for body_html
  const iv2 = new Uint8Array(12);
  iv2.set(iv);
  iv2[11] = (iv2[11] + 1) & 0xff; // increment last byte for second field

  const result: EncryptedFields = {
    body_text: bodyText
      ? bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(bodyText))))
      : null,
    body_html: bodyHtml
      ? bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, key, new TextEncoder().encode(bodyHtml))))
      : null,
    is_encrypted: 1,
    encryption_iv: ivBase64,
    encryption_version: 1,
  };

  return result;
}

/**
 * Decrypt email fields. If is_encrypted=0, returns as-is.
 */
export async function decryptEmailFields(
  env: Env,
  row: { body_text?: string | null; body_html?: string | null; is_encrypted?: number; encryption_iv?: string | null },
): Promise<{ body_text: string | null; body_html: string | null }> {
  if (!row.is_encrypted || !env.ENCRYPTION_KEY || !row.encryption_iv) {
    return { body_text: row.body_text ?? null, body_html: row.body_html ?? null };
  }

  const key = await importKey(env.ENCRYPTION_KEY);
  const iv = base64ToBytes(row.encryption_iv);

  // Derive second IV for body_html
  const iv2 = new Uint8Array(12);
  iv2.set(iv);
  iv2[11] = (iv2[11] + 1) & 0xff;

  let bodyText: string | null = null;
  let bodyHtml: string | null = null;

  if (row.body_text) {
    try {
      bodyText = await decrypt(key, row.body_text, row.encryption_iv);
    } catch {
      bodyText = '[DECRYPTION_FAILED]';
    }
  }

  if (row.body_html) {
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv2 },
        key,
        base64ToBytes(row.body_html),
      );
      bodyHtml = new TextDecoder().decode(decrypted);
    } catch {
      bodyHtml = '[DECRYPTION_FAILED]';
    }
  }

  return { body_text: bodyText, body_html: bodyHtml };
}
