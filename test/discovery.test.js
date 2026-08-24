'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createDiscoveryService } = require('../src/discovery');
const { SourceHealthStore } = require('../src/source-health-store');
const {
  createRawArticle,
  createTestConfig,
  createTestRegistry,
  silentLogger,
} = require('./helpers');

function createService(fetchByKey, enabledSources = ['ann', 'animecorner']) {
  const sourceRegistry = createTestRegistry(fetchByKey);
  const definitions = enabledSources.map((key) => sourceRegistry[key]);
  const healthStore = new SourceHealthStore(definitions);
  const service = createDiscoveryService({
    config: createTestConfig({ enabledSources }),
    sourceRegistry,
    healthStore,
    logger: silentLogger,
    now: () => new Date('2026-08-24T12:00:00.000Z'),
    monotonicNow: (() => {
      let value = 0;
      return () => value += 5;
    })(),
  });
  return { healthStore, service };
}

test('discovery returns normalized articles and preserves same titles across providers', async () => {
  const commonTitle = 'The same anime announcement';
  const { service } = createService({
    ann: () => [createRawArticle('ann', { title: commonTitle })],
    animecorner: () => [createRawArticle('animecorner', { title: commonTitle })],
  });

  const result = await service.run();
  assert.equal(result.allSourcesFailed, false);
  assert.equal(result.response.articles.length, 2);
  assert.equal(result.response.schemaVersion, 2);
  assert.deepEqual(result.response.articles.map((article) => article.providerKey), [
    'ann', 'animecorner',
  ]);
  assert.equal(result.response.articles[0].excerpt, 'Safe summary');
  assert.ok(result.response.articles.every((article) => article.articleRef.length > 40));
  assert.equal(JSON.stringify(result.response).includes('contentHtml'), false);
});

test('discovery removes only exact duplicates inside one provider', async () => {
  const duplicate = createRawArticle('ann', { providerArticleId: 'guid-1' });
  const { service } = createService({ ann: () => [duplicate, { ...duplicate }] }, ['ann']);

  const result = await service.run();
  assert.equal(result.response.articles.length, 1);
  assert.equal(result.response.sources[0].outcome, 'degraded');
  assert.deepEqual(result.response.sources[0].warnings, ['DUPLICATE_ITEM_DROPPED']);
});

test('invalid date becomes null while invalid articles are filtered', async () => {
  const { service } = createService({
    ann: () => [
      createRawArticle('ann', {
        date: 'not-a-date',
        excerpt: '&lt;b&gt;Safe&lt;/b&gt;&lt;script&gt;bad()&lt;/script&gt;',
      }),
      createRawArticle('ann', { title: '', link: 'https://news.google.com/invalid' }),
      createRawArticle('ann', { link: 'https://evil.example.test/news' }),
    ],
  }, ['ann']);

  const result = await service.run();
  assert.equal(result.response.articles.length, 1);
  assert.equal(result.response.articles[0].publishedAt, null);
  assert.equal(result.response.articles[0].excerpt, 'Safe');
  assert.equal(result.response.sources[0].outcome, 'degraded');
  assert.ok(result.response.sources[0].warnings.includes('INVALID_ITEM_DROPPED'));
  assert.ok(result.response.sources[0].warnings.includes('INVALID_DATE_DROPPED'));
});

test('missing or invalid image metadata never invalidates an otherwise valid article', async () => {
  const { service } = createService({
    animecorner: () => [createRawArticle('animecorner', { image: 'http://unsafe.test/image.jpg' })],
  }, ['animecorner']);
  const result = await service.run();
  assert.equal(result.response.articles.length, 1);
  assert.equal(result.response.articles[0].imageUrl, null);
});

test('partial failures keep successful articles and update health independently', async () => {
  const { healthStore, service } = createService({
    ann: () => [createRawArticle('ann')],
    animecorner: () => { throw new Error('upstream detail'); },
  });

  const result = await service.run();
  assert.equal(result.allSourcesFailed, false);
  assert.equal(result.response.articles.length, 1);
  assert.deepEqual(result.response.sources.map((source) => source.outcome), ['healthy', 'failed']);
  assert.equal(result.response.sources[1].errorCode, 'SOURCE_FETCH_FAILED');

  const health = healthStore.read();
  assert.equal(health[0].lastSuccessAt, '2026-08-24T12:00:00.000Z');
  assert.equal(health[1].consecutiveFailures, 1);
  assert.equal(health[1].lastErrorCode, 'SOURCE_FETCH_FAILED');
});

test('total explicit failure is distinguishable from a healthy zero result', async () => {
  const failed = createService({ ann: () => { throw new Error('down'); } }, ['ann']);
  const empty = createService({ ann: () => [] }, ['ann']);

  const failedResult = await failed.service.run();
  const emptyResult = await empty.service.run();
  assert.equal(failedResult.allSourcesFailed, true);
  assert.equal(failedResult.response.sources[0].outcome, 'failed');
  assert.equal(emptyResult.allSourcesFailed, false);
  assert.equal(emptyResult.response.sources[0].outcome, 'healthy');
  assert.equal(emptyResult.response.sources[0].articleCount, 0);
});

test('legacy empty results are marked as ambiguous degradation', async () => {
  const sourceRegistry = createTestRegistry({ ann: () => [] });
  sourceRegistry.ann.emptyResultAmbiguous = true;
  const healthStore = new SourceHealthStore([sourceRegistry.ann]);
  const service = createDiscoveryService({
    config: createTestConfig({ enabledSources: ['ann'] }),
    sourceRegistry,
    healthStore,
    logger: silentLogger,
  });

  const result = await service.run();
  assert.equal(result.response.sources[0].outcome, 'degraded');
  assert.deepEqual(result.response.sources[0].warnings, ['LEGACY_EMPTY_RESULT_AMBIGUOUS']);
});

test('structured provider outcomes retain stable errors and health freshness metadata', async () => {
  let shouldFail = true;
  const sourceRegistry = createTestRegistry({
    ann: () => (shouldFail
      ? {
        articles: [],
        outcome: 'failed',
        warnings: [],
        errorCode: 'PROVIDER_TIMEOUT',
        attemptCount: 3,
        cacheStatus: 'miss',
        freshUntil: null,
      }
      : {
        articles: [createRawArticle('ann')],
        outcome: 'healthy',
        warnings: [],
        errorCode: null,
        attemptCount: 1,
        cacheStatus: 'not_modified',
        freshUntil: '2026-08-24T16:00:00.000Z',
      }),
  });
  const healthStore = new SourceHealthStore([sourceRegistry.ann]);
  const service = createDiscoveryService({
    config: createTestConfig({ enabledSources: ['ann'] }),
    sourceRegistry,
    healthStore,
    logger: silentLogger,
    now: () => new Date('2026-08-24T12:00:00.000Z'),
  });

  assert.equal((await service.run()).response.sources[0].errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(healthStore.read()[0].consecutiveFailures, 1);
  shouldFail = false;
  assert.equal((await service.run()).response.sources[0].outcome, 'healthy');
  const health = healthStore.read()[0];
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.freshUntil, '2026-08-24T16:00:00.000Z');
  assert.deepEqual(health.lastWarningCodes, []);
  assert.equal(health.discoveryAttempts, 2);
  assert.equal(health.upstreamAttemptCount, 4);
  assert.equal(health.successes, 1);
  assert.equal(health.failures, 1);
  assert.equal(health.notModifiedCount, 1);
});

test('discovery response is reduced below the two MiB wire limit', async () => {
  const enabledSources = ['ann', 'animecorner', 'animetrending', 'crunchyroll'];
  const padding = 'x'.repeat(1800);
  const fetchByKey = Object.fromEntries(enabledSources.map((providerKey) => [
    providerKey,
    () => Array.from({ length: 100 }, (_, index) => createRawArticle(providerKey, {
      title: 't'.repeat(500),
      excerpt: 'e'.repeat(2000),
      link: `${createRawArticle(providerKey).link}?id=${index}&padding=${padding}`,
      image: `https://images.example.test/${index}?padding=${padding}`,
    })),
  ]));
  const { service } = createService(fetchByKey, enabledSources);

  const result = await service.run();
  assert.ok(Buffer.byteLength(JSON.stringify(result.response), 'utf8') <= 2 * 1024 * 1024);
  assert.ok(result.response.articles.length < 400);
  assert.ok(result.response.sources.some(
    (source) => source.warnings.includes('RESPONSE_SIZE_LIMIT'),
  ));
});

test('concurrent discovery runs coalesce the complete run and release state afterward', async () => {
  let releaseFetch;
  let calls = 0;
  const pending = new Promise((resolve) => { releaseFetch = resolve; });
  const { service } = createService({
    ann: async () => {
      calls += 1;
      await pending;
      return [createRawArticle('ann')];
    },
  }, ['ann']);

  const first = service.run();
  const second = service.run();
  assert.equal(first, second);
  assert.deepEqual(service.inspect(), { inflight: 1 });
  assert.equal(calls, 1);

  releaseFetch();
  const [one, two] = await Promise.all([first, second]);
  assert.deepEqual(one, two);
  assert.deepEqual(service.inspect(), { inflight: 0 });
});
