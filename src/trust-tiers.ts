import { Env } from './types';
import { nowUnix } from './utils';
import { countMutualContacts } from './contact-graph';

export const TIER_NAMES = ['anonymous', 'verified', 'established', 'paid'] as const;

/**
 * Cantonese cuisine word pool for random agent address generation.
 * Format: {dish}-{4-char code}, e.g. char-siu-a3f8, har-gow-x7k2
 */
const CANTONESE_DISHES = [
  'char-siu', 'roast-goose', 'white-chicken', 'sweet-sour-pork',
  'braised-pork', 'stewed-taro', 'roast-pigeon', 'lobster-soup',
  'sea-cucumber', 'har-gow', 'siu-mai', 'char-siu-bao',
  'egg-custard', 'turnip-cake', 'ma-tai-go', 'taro-cake',
  'rice-rolls', 'beef-ho-fun', 'egg-tart', 'singapore-noodles',
  'wonton-mein', 'boat-congee', 'ginger-curd', 'double-skin-milk',
  'mango-sago',
];

/**
 * Generate a random slug: {cantonese-dish}-{4-char code}.
 * 25 dishes × 36^4 ≈ 42M combinations.
 */
export function generateRandomSlug(): string {
  const dish = CANTONESE_DISHES[Math.floor(Math.random() * CANTONESE_DISHES.length)];
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `${dish}-${code}`;
}

/**
 * Calculate what tier an agent qualifies for based on current state.
 * Does NOT update the DB — caller decides whether to persist.
 */
export async function calculateTrustTier(
  env: Env,
  agentId: string,
): Promise<number> {
  const { DB } = env;

  // Get agent info
  const agent = await DB.prepare(
    'SELECT owner_id, created_at FROM agents WHERE id = ?'
  ).bind(agentId).first<{ owner_id: string | null; created_at: number }>();

  if (!agent) return 0;

  // Check Tier 1 criteria: owner OR 3+ mutual contacts
  const hasOwner = agent.owner_id !== null;
  const mutualCount = await countMutualContacts(env, agentId);
  const qualifiesForTier1 = hasOwner || mutualCount >= 3;

  if (!qualifiesForTier1) return 0;

  // Check Tier 2 criteria: Tier 1 + sent >= 10 + received >= 10 + active >= 7 days
  const sentCount = await DB.prepare(
    'SELECT COUNT(*) as count FROM sent_emails WHERE agent_id = ?'
  ).bind(agentId).first<{ count: number }>();

  const recvCount = await DB.prepare(
    'SELECT COUNT(*) as count FROM emails WHERE agent_id = ?'
  ).bind(agentId).first<{ count: number }>();

  const now = nowUnix();
  const sevenDays = 7 * 24 * 60 * 60;
  const isOldEnough = (now - (agent.created_at || now)) >= sevenDays;

  if (
    (sentCount?.count ?? 0) >= 10 &&
    (recvCount?.count ?? 0) >= 10 &&
    isOldEnough
  ) {
    return 2;
  }

  return 1;
}

/**
 * Check and upgrade tier if agent now qualifies for a higher one.
 * Never downgrades. Returns the new tier (or current if no change).
 */
export async function maybeUpgradeTier(
  env: Env,
  agentId: string,
): Promise<number> {
  const { DB } = env;

  const current = await DB.prepare(
    'SELECT trust_tier FROM agents WHERE id = ?'
  ).bind(agentId).first<{ trust_tier: number }>();

  const currentTier = current?.trust_tier ?? 0;
  const calculatedTier = await calculateTrustTier(env, agentId);

  if (calculatedTier > currentTier) {
    await DB.prepare(
      'UPDATE agents SET trust_tier = ? WHERE id = ?'
    ).bind(calculatedTier, agentId).run();
    return calculatedTier;
  }

  return currentTier;
}
