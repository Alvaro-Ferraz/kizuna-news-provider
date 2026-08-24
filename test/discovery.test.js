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
  assert.deepEqual(result.response.articles.map((article) => article.providerKey), [
    'ann', 'animecorner',
  ]);
  assert.equal(result.response.articles[0].excerpt, 'Safe summary');
  assert.equal(JSON.stringify(result.response).includes('contentHtml'), false);
});

test('discovery removes only exact duplicates inside one provider', async () => {
  const duplicate = createRawArticle('ann', { providerArticleId: 'guid-1' });
  const { service } = createService({ ann: () => [duplicate, { ...duplicate }] }, ['ann']);

  const result = await service.run();
  assert.equal(result.response.articles.length, 1);
  assert.equal(result.response.sources[0].outcome, 'degraded');
  assert.deepEqual(result.response.sources[0].warnings, ['DUPLICATE_ARTICLE_FILTERED']);
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
  assert.ok(result.response.sources[0].warnings.includes('INVALID_ARTICLE_FILTERED'));
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
