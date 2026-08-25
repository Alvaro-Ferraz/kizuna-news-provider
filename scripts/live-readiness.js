'use strict';

const axios = require('axios');

const baseUrl = (process.env.API_URL || '').replace(/\/$/u, '');
const secret = process.env.KIZUNA_NEWS_PROVIDER_SECRET;
const allowLive = process.env.ALLOW_LIVE_PROVIDER_TESTS === 'true';
const allowExtraction = process.env.ALLOW_LIVE_ARTICLE_EXTRACTIONS === 'true';
const extractionProviders = new Set([
  'ann', 'animecorner', 'animetrending', 'crunchyroll',
  'myanimelist', 'otakuusa', 'animeherald',
]);

if (!allowLive) {
  console.error('Set ALLOW_LIVE_PROVIDER_TESTS=true for the explicitly bounded live check.');
  process.exit(1);
}
if (!/^https?:\/\//u.test(baseUrl)) {
  console.error('API_URL must be an absolute HTTP(S) URL.');
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error('KIZUNA_NEWS_PROVIDER_SECRET must contain at least 32 characters.');
  process.exit(1);
}

const client = axios.create({
  baseURL: baseUrl,
  headers: { Authorization: `Bearer ${secret}` },
  timeout: 65_000,
  validateStatus: () => true,
});

async function run() {
  const discovery = await client.post('/internal/v1/discovery-runs', {});
  if (discovery.status !== 200 || discovery.data?.schemaVersion !== 2) {
    throw new Error(`Live discovery returned status ${discovery.status}`);
  }

  const health = await client.get('/internal/v1/sources/health');
  if (health.status !== 200) throw new Error(`Source health returned status ${health.status}`);
  const healthByProvider = new Map(health.data.sources.map((source) => [source.providerKey, source]));
  const summary = {
    label: 'LIVE_BOUNDED',
    discoveryOperations: 1,
    sources: discovery.data.sources.map((source) => ({
      providerKey: source.providerKey,
      outcome: source.outcome,
      articleCount: source.articleCount,
      durationMs: source.durationMs,
      upstreamAttempts: healthByProvider.get(source.providerKey)?.lastAttemptCount ?? null,
      errorCode: source.errorCode,
    })),
    extractions: [],
  };

  if (allowExtraction) {
    for (const providerKey of extractionProviders) {
      const candidate = discovery.data.articles.find((article) => article.providerKey === providerKey);
      if (!candidate) {
        summary.extractions.push({ providerKey, outcome: 'not-attempted', reason: 'no-article' });
        continue;
      }
      const startedAt = Date.now();
      const response = await client.post('/internal/v1/article-extractions', {
        articleRef: candidate.articleRef,
      });
      const item = response.data?.article;
      summary.extractions.push(response.status === 200 ? {
        providerKey,
        outcome: 'success',
        status: response.status,
        durationMs: Date.now() - startedAt,
        selectorVersion: item.selectorVersion,
        contentCharacters: item.contentText.length,
        blockCount: item.blocks.length,
        warningCount: item.warnings.length,
      } : {
        providerKey,
        outcome: 'failed',
        status: response.status,
        durationMs: Date.now() - startedAt,
        errorCode: response.data?.error?.code || 'UNKNOWN',
      });
    }
  }

  console.info(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Live readiness check failed');
  process.exitCode = 1;
});
