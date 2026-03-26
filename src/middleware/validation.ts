import { jsonResponse } from '../utils';
import { checkReservedName } from '../reserved-names';

/**
 * Validate agent name: 5-30 chars, alphanumeric + hyphens, no leading/trailing hyphens.
 * Also checks against reserved name wordlist and pattern rules.
 */
export function validateAgentName(name: string): Response | null {
  if (!name || typeof name !== 'string') {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
  }

  const trimmed = name.trim();

  if (trimmed.length < 5 || trimmed.length > 30) {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Name must be 5-30 characters' } }, 400);
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(trimmed) && trimmed.length > 1) {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Name must be alphanumeric with hyphens, no leading/trailing hyphens' } }, 400);
  }

  if (/[^a-zA-Z0-9-]/.test(trimmed)) {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Name must contain only letters, numbers, and hyphens' } }, 400);
  }

  const reserved = checkReservedName(trimmed);
  if (reserved.reserved) {
    return jsonResponse({ error: { code: 'NAME_RESERVED', message: reserved.reason } }, 403);
  }

  return null;
}

/**
 * Validate email address format.
 */
export function validateEmail(email: string): Response | null {
  if (!email || typeof email !== 'string') {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Email is required' } }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Invalid email address format' } }, 400);
  }

  return null;
}
