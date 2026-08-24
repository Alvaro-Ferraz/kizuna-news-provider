'use strict';

/*
 * LIVE NETWORK TEST. DO NOT RUN IN ORDINARY CI.
 * This command invokes the configured providers and requires explicit opt-in.
 */

const axios = require('axios');

if (process.env.ALLOW_LIVE_PROVIDER_TESTS !== 'true') {
  console.error('Live provider tests are disabled; set ALLOW_LIVE_PROVIDER_TESTS=true.');
  process.exit(1);
}

const baseUrl = process.env.API_URL || 'http://localhost:3000';
const secret = process.env.KIZUNA_NEWS_PROVIDER_SECRET;
if (!secret || secret.length < 32) {
  console.error('KIZUNA_NEWS_PROVIDER_SECRET must contain at least 32 characters.');
  process.exit(1);
}

async function run() {
  const health = await axios.get(`${baseUrl}/health`, {
    timeout: 10_000,
    validateStatus: () => true,
  });
  if (health.status !== 200 || health.data?.status !== 'ok') {
    throw new Error(`Health smoke failed with status ${health.status}`);
  }

  const discovery = await axios.post(`${baseUrl}/internal/v1/discovery-runs`, {}, {
    headers: { Authorization: `Bearer ${secret}` },
    timeout: 120_000,
    validateStatus: () => true,
  });
  if (discovery.status !== 200 || discovery.data?.schemaVersion !== 1) {
    throw new Error(`Discovery smoke failed with status ${discovery.status}`);
  }

  console.log(`Live smoke passed with ${discovery.data.articles.length} normalized articles.`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
