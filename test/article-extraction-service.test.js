'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createArticleExtractionService } = require('../src/article-extraction-service');
const { createArticleRefSigner } = require('../src/article-ref');
const { createDiscoveryService } = require('../src/discovery');
const { SourceHealthStore } = require('../src/source-health-store');
const {
  TEST_ARTICLE_REF_SECRET,
  createTestConfig,
  createTestRegistry,
  silentLogger,
} = require('./helpers');

const instant = new Date('2026-08-24T12:00:00.000Z');
const html = readFileSync(path.join(__dirname, 'fixtures', 'ann-article.html'), 'utf8');

function createRef(overrides = {}) {
  const signer = createArticleRefSigner({
    secret: TEST_ARTICLE_REF_SECRET,
    now: () => instant.getTime(),
  });
  return signer.sign({
    providerKey: 'ann',
    providerArticleId: 'ann-guid-1',
    canonicalSourceUrl: 'https://www.animenewsnetwork.com/news/example/.1',
    locale: 'en-US',
    ...overrides,
  });
}

function createService(httpClient, overrides = {}) {
  const config = createTestConfig({ enabledSources: ['ann'] });
  const sourceRegistry = createTestRegistry();
  return createArticleExtractionService({
    config,
    sourceRegistry,
    logger: silentLogger,
    httpClient,
    now: () => instant,
    ...overrides,
  });
}

test('discovery articleRef remains extractable after discovery state is evicted or unavailable', async () => {
  const config = createTestConfig({ enabledSources: ['ann'] });
  const sourceRegistry = createTestRegistry();
  const discovery = createDiscoveryService({
    config,
    sourceRegistry,
    healthStore: new SourceHealthStore([sourceRegistry.ann]),
    logger: silentLogger,
    now: () => instant,
  });
  const discovered = await discovery.run();
  const articleRef = discovered.response.articles[0].articleRef;
  sourceRegistry.ann.fetch = () => { throw new Error('discovery cache and source unavailable'); };

  let articleFetches = 0;
  const extraction = createArticleExtractionService({
    config,
    sourceRegistry,
    logger: silentLogger,
    now: () => instant,
    httpClient: {
      getArticle: () => {
        articleFetches += 1;
        return {
          body: html,
          finalUrl: 'https://www.animenewsnetwork.com/news/example/.1',
          attemptCount: 1,
        };
      },
    },
  });
  const result = await extraction.extract({ articleRef, requestId: 'cache-eviction-test' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.article.providerKey, 'ann');
  assert.equal(articleFetches, 1);
  assert.equal(Object.hasOwn(result, 'articleRef'), false);
  assert.equal(/<[^>]+>/u.test(result.article.contentText), false);
});

test('invalid, expired, and disabled articleRefs fail before any article fetch', async () => {
  let calls = 0;
  const httpClient = { getArticle: () => { calls += 1; } };
  const service = createService(httpClient);
  await assert.rejects(
    () => service.extract({ articleRef: 'tampered.value', requestId: 'invalid' }),
    (error) => error.code === 'INVALID_ARTICLE_REF' && error.status === 422,
  );

  const disabled = createArticleExtractionService({
    config: createTestConfig({ enabledSources: ['animecorner'] }),
    sourceRegistry: createTestRegistry(),
    logger: silentLogger,
    httpClient,
    now: () => instant,
  });
  await assert.rejects(
    () => disabled.extract({ articleRef: createRef(), requestId: 'disabled' }),
    (error) => error.code === 'ARTICLE_PROVIDER_NOT_ENABLED' && error.status === 422,
  );
  assert.equal(calls, 0);
});

test('article transport failures map to stable safe extraction codes', async () => {
  const cases = [
    ['PROVIDER_DNS_REJECTED', 'ARTICLE_DNS_REJECTED', 422],
    ['PROVIDER_REDIRECT_REJECTED', 'ARTICLE_REDIRECT_REJECTED', 502],
    ['PROVIDER_RESPONSE_TOO_LARGE', 'ARTICLE_RESPONSE_TOO_LARGE', 502],
    ['PROVIDER_INVALID_CONTENT_TYPE', 'ARTICLE_UNSUPPORTED_CONTENT_TYPE', 502],
    ['PROVIDER_TIMEOUT', 'ARTICLE_TIMEOUT', 504],
  ];
  for (const [providerCode, expectedCode, status] of cases) {
    const providerError = Object.assign(new Error('private detail'), {
      code: providerCode,
      attemptCount: 1,
    });
    const service = createService({ getArticle: () => { throw providerError; } });
    await assert.rejects(
      () => service.extract({ articleRef: createRef(), requestId: expectedCode }),
      (error) => error.code === expectedCode && error.status === status
        && !error.message.includes('private detail'),
    );
  }
});

test('extraction circuit opens independently after repeated article failures', async () => {
  let calls = 0;
  const providerError = Object.assign(new Error('upstream failed'), {
    code: 'PROVIDER_HTTP_5XX',
    attemptCount: 2,
  });
  const service = createService({
    getArticle: () => {
      calls += 1;
      throw providerError;
    },
  });
  for (let index = 0; index < 3; index += 1) {
    await assert.rejects(
      () => service.extract({ articleRef: createRef(), requestId: `failure-${index}` }),
      (error) => error.code === 'ARTICLE_HTTP_ERROR',
    );
  }
  await assert.rejects(
    () => service.extract({ articleRef: createRef(), requestId: 'circuit-open' }),
    (error) => error.code === 'ARTICLE_CIRCUIT_OPEN' && error.status === 502,
  );
  assert.equal(calls, 3);
});

test('same-reference requests coalesce while excess distinct work fails fast at capacity', async () => {
  let releaseFetch;
  let calls = 0;
  const pending = new Promise((resolve) => { releaseFetch = resolve; });
  const service = createService({
    getArticle: async () => {
      calls += 1;
      await pending;
      return {
        body: html,
        finalUrl: 'https://www.animenewsnetwork.com/news/example/.1',
        attemptCount: 1,
      };
    },
  }, { capacity: 1 });

  const articleRef = createRef();
  const first = service.extract({ articleRef, requestId: 'first' });
  const coalesced = service.extract({ articleRef, requestId: 'same' });
  await assert.rejects(
    () => service.extract({
      articleRef: createRef({
        providerArticleId: 'ann-guid-2',
        canonicalSourceUrl: 'https://www.animenewsnetwork.com/news/example/.2',
      }),
      requestId: 'excess',
    }),
    (error) => error.code === 'EXTRACTION_CAPACITY_EXCEEDED' && error.status === 429,
  );
  releaseFetch();
  const [one, two] = await Promise.all([first, coalesced]);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
  const inspection = service.inspect();
  assert.equal(inspection.active, 0);
  assert.equal(inspection.inflight, 0);
  assert.deepEqual(inspection.metrics.ann, {
    attempts: 3,
    successes: 2,
    failures: 1,
    lastSuccessAt: instant.toISOString(),
    lastErrorCode: null,
    lastDurationMs: inspection.metrics.ann.lastDurationMs,
  });
});

test('extraction logs contain safe metadata but no articleRef, URL, HTML, or content text', async () => {
  const entries = [];
  const service = createService({
    getArticle: () => ({
      body: html,
      finalUrl: 'https://www.animenewsnetwork.com/news/example/.1',
      attemptCount: 1,
    }),
  }, { logger: { info: (event, fields) => entries.push({ event, fields }), error() {} } });
  const articleRef = createRef();
  await service.extract({ articleRef, requestId: 'safe-log' });
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes(articleRef), false);
  assert.equal(serialized.includes('animenewsnetwork.com'), false);
  assert.equal(serialized.includes('<html'), false);
  assert.equal(serialized.includes('The studio announced'), false);
  assert.equal(entries[0].fields.selectorVersion, 'ann-v1');
});
