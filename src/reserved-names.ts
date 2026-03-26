/**
 * Reserved mailbox names — prevents squatting of system, brand, and sensitive names.
 * Names in this list cannot be bound via POST /api/agents/:id/name.
 */

// ── a. 系统词 ──────────────────────────────────────────────
const SYSTEM_WORDS = [
  'admin', 'administrator', 'system', 'root', 'superuser',
  'postmaster', 'abuse', 'noreply', 'no-reply', 'mailer-daemon',
  'hostmaster', 'webmaster', 'localhost', 'server', 'daemon', 'cron', 'bot',
  'null', 'undefined', 'void', 'nobody', 'anonymous', 'unknown',
  'agentsmail', 'agents-mail', 'support', 'help', 'info',
  'contact', 'team', 'hello', 'feedback',
  'security', 'cert', 'ssl', 'dmarc', 'dkim', 'spf',
  'billing', 'sales', 'legal', 'compliance', 'privacy',
  'api', 'dev', 'test', 'staging', 'demo',
  'newsletter', 'notifications', 'alerts', 'status',
];

// ── b. 国家/地区名 ─────────────────────────────────────────
const COUNTRIES = [
  'china', 'usa', 'japan', 'korea', 'germany', 'france', 'uk', 'india',
  'canada', 'australia', 'brazil', 'russia', 'mexico', 'italy', 'spain',
  'singapore', 'thailand', 'vietnam', 'malaysia', 'indonesia',
  'taiwan', 'hongkong', 'macau', 'europe', 'africa', 'asia',
];

// ── c. 著名品牌 ────────────────────────────────────────────
const BRANDS = [
  'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook',
  'openai', 'anthropic', 'tesla', 'nvidia', 'samsung', 'huawei',
  'alibaba', 'tencent', 'baidu', 'bytedance', 'xiaomi', 'wechat',
  'twitter', 'github', 'cloudflare', 'vercel', 'stripe',
];

// ── d. 商标/产品名 ─────────────────────────────────────────
const TRADEMARKS = [
  'chatgpt', 'claude', 'gemini', 'copilot', 'siri', 'alexa',
  'iphone', 'android', 'windows', 'linux', 'macos',
  'gmail', 'outlook', 'yahoo', 'hotmail', 'proton',
];

// ── e. 专有名词/敏感词 ─────────────────────────────────────
const SENSITIVE = [
  'god', 'sex', 'porn', 'drugs', 'hack', 'hacker', 'virus', 'malware',
  'spam', 'phishing', 'scam', 'fraud', 'terrorist', 'nazi',
  'police', 'government', 'president', 'congress', 'fbi', 'cia', 'nsa',
];

/** Combined reserved name set (lowercase) */
const RESERVED_NAMES = new Set([
  ...SYSTEM_WORDS,
  ...COUNTRIES,
  ...BRANDS,
  ...TRADEMARKS,
  ...SENSITIVE,
]);

/**
 * Check if a name is reserved — by wordlist or by pattern rules.
 *
 * Rules:
 *   a. Names shorter than 5 characters are reserved (scarce resource)
 *   b. 6+ consecutive identical digits are reserved (e.g. 111111, 999999)
 */
export function checkReservedName(
  name: string,
): { reserved: true; reason: string } | { reserved: false } {
  const lower = name.toLowerCase().trim();

  // Rule a: short names (< 5 chars) are reserved
  if (lower.length < 5) {
    return { reserved: true, reason: 'Names shorter than 5 characters are reserved' };
  }

  // Rule b: 6+ consecutive identical digits (strip hyphens first)
  const digits = lower.replace(/-/g, '');
  if (/^(\d)\1{5,}$/.test(digits)) {
    return { reserved: true, reason: 'Repeated digit sequences are reserved' };
  }

  // Wordlist check
  if (RESERVED_NAMES.has(lower)) {
    return { reserved: true, reason: 'This name is reserved for system use' };
  }

  return { reserved: false };
}
