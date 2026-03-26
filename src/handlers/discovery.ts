import { Env } from '../types';
import { jsonResponse } from '../utils';

export async function handleHealthCheck(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  return jsonResponse({ status: 'ok', service: 'agents-mail' });
}

export async function handleServiceDiscovery(
  request: Request,
  env: Env,
  params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  return jsonResponse({
    service: 'agents-mail',
    version: '1.0',
    api_url: `${url.protocol}//${url.host}`,
    domain: env.DOMAIN || 'agentsmail.org',
    capabilities: ['send', 'receive', 'webhook'],
    trust_tiers: {
      0: { name: 'anonymous', capabilities: ['receive'], address: 'random' },
      1: { name: 'verified', capabilities: ['send', 'receive', 'bind_name'], address: 'custom' },
      2: { name: 'established', capabilities: ['send', 'receive', 'bind_name', 'higher_limits'], address: 'custom' },
    },
    endpoints: {
      register: '/api/agents',
      send: '/api/agents/:id/emails',
      list: '/api/agents/:id/emails',
      bind_name: '/api/agents/:id/name',
    },
  });
}
