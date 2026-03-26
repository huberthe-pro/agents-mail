import { Env } from './types';

const DEFAULT_ADMIN_APP_URL = 'https://agent-mailbox-admin.pages.dev';

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeBaseUrl(value: string, fallback: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return ensureTrailingSlash(url.toString());
  } catch {
    return ensureTrailingSlash(fallback);
  }
}

export function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function resolveAdminAppBaseUrl(env: Env): string {
  if (env.ADMIN_APP_URL) {
    return normalizeBaseUrl(env.ADMIN_APP_URL, DEFAULT_ADMIN_APP_URL);
  }

  return ensureTrailingSlash(DEFAULT_ADMIN_APP_URL);
}

export function buildAppUrl(baseUrl: string, pathname: string, searchParams?: Record<string, string>): string {
  const url = new URL(pathname.replace(/^\//, ''), ensureTrailingSlash(baseUrl));

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}
