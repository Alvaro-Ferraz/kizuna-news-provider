'use strict';

const axios = require('axios');

const baseUrl = (process.env.API_URL || '').replace(/\/$/u, '');
const secret = process.env.KIZUNA_NEWS_PROVIDER_SECRET;
const allowDiscovery = process.env.ALLOW_LIVE_DISCOVERY_SMOKE === 'true';

if (!/^https?:\/\//u.test(baseUrl)) {
  console.error('API_URL must be an absolute HTTP(S) URL.');
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error('KIZUNA_NEWS_PROVIDER_SECRET must contain at least 32 characters.');
  process.exit(1);
}

function request(method, path, options = {}) {
  return axios.request({
    method,
    url: `${baseUrl}${path}`,
    timeout: 30_000,
    validateStatus: () => true,
    ...options,
  });
}

async function run() {
  const health = await request('GET', '/health');
  if (health.status !== 200 || health.data?.status !== 'ok') throw new Error('Health failed');

  const unauthorized = await request('GET', '/internal/v1/sources/health');
  if (unauthorized.status !== 401 || unauthorized.data?.error?.code !== 'UNAUTHORIZED') {
    throw new Error('Unauthorized boundary failed');
  }

  const headers = { Authorization: `Bearer ${secret}` };
  const sourceHealth = await request('GET', '/internal/v1/sources/health', { headers });
  if (sourceHealth.status !== 200 || sourceHealth.data?.schemaVersion !== 1) {
    throw new Error('Authorized source health failed');
  }

  const summary = {
    health: 'ok',
    unauthorizedBoundary: 'ok',
    sourceHealth: 'ok',
    discovery: 'not-requested',
  };
  if (allowDiscovery) {
    const discovery = await request('POST', '/internal/v1/discovery-runs', {
      headers,
      data: {},
      timeout: 60_000,
    });
    if (discovery.status !== 200 || discovery.data?.schemaVersion !== 2) {
      throw new Error(`Discovery failed with status ${discovery.status}`);
    }
    summary.discovery = {
      articleCount: discovery.data.articles.length,
      sources: discovery.data.sources.map((source) => ({
        providerKey: source.providerKey,
        outcome: source.outcome,
        articleCount: source.articleCount,
        durationMs: source.durationMs,
      })),
    };
  }
  console.info(JSON.stringify(summary));
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
