'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ProviderError } = require('../src/provider-error');
const { createRssProvider } = require('../src/rss-provider');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');

const fixtureDirectory = path.join(__dirname, 'fixtures');
function fixture(name) {
  return readFileSync(path.join(fixtureDirectory, name), 'utf8');
}

function successfulResponse(body, headers = {}) {
  return { status: 200, body, headers, attemptCount: 1 };
}

test('ANN freshness avoids upstream calls, then sends Last-Modified and reuses cache on 304', async () => {
  let nowMs = Date.parse('2026-08-24T12:00:00.000Z');
  const calls = [];
  const responses = [
    successfulResponse(fixture('ann.xml'), {
      'last-modified': 'Mon, 24 Aug 2026 11:00:00 GMT',
      'cache-control': 'public, max-age=60',
    }),
    { status: 304, body: null, headers: { 'cache-control': 'max-age=60' }, attemptCount: 1 },
  ];
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    now: () => nowMs,
    httpClient: { getRss(options) { calls.push(options); return responses.shift(); } },
  });

  const first = await provider.fetch();
  nowMs += 30_000;
  const fresh = await provider.fetch();
  assert.equal(calls.length, 1);
  assert.equal(fresh.cacheStatus, 'fresh');
  assert.deepEqual(fresh.articles, first.articles);

  nowMs += 31_000;
  const notModified = await provider.fetch();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].conditionalHeaders['If-Modified-Since'], 'Mon, 24 Aug 2026 11:00:00 GMT');
  assert.equal(notModified.cacheStatus, 'not_modified');
  assert.deepEqual(notModified.articles, first.articles);
});

test('ETag and Last-Modified validators are retained for Anime Corner', async () => {
  let nowMs = 1_000;
  const calls = [];
  const responses = [
    successfulResponse(fixture('animecorner.xml'), {
      etag: '"corner-v1"',
      'last-modified': 'Mon, 24 Aug 2026 10:00:00 GMT',
      'cache-control': 'max-age=0',
    }),
    { status: 304, body: null, headers: {}, attemptCount: 1 },
  ];
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.animecorner, {
    now: () => nowMs,
    httpClient: { getRss(options) { calls.push(options); return responses.shift(); } },
  });
  await provider.fetch();
  nowMs += 1;
  await provider.fetch();
  assert.deepEqual(calls[1].conditionalHeaders, {
    'If-None-Match': '"corner-v1"',
    'If-Modified-Since': 'Mon, 24 Aug 2026 10:00:00 GMT',
  });
});

test('304 without a matching memory cache is an explicit provider failure', async () => {
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: { getRss() { return { status: 304, headers: {}, attemptCount: 1 }; } },
  });
  const result = await provider.fetch();
  assert.equal(result.outcome, 'failed');
  assert.equal(result.errorCode, 'PROVIDER_NOT_MODIFIED_WITHOUT_CACHE');
});

test('Crunchyroll uses pt-BR alone when healthy and en-US only as fallback', async () => {
  const definition = V1_PROVIDER_DEFINITIONS.crunchyroll;
  const healthyCalls = [];
  const healthy = createRssProvider(definition, {
    httpClient: { getRss(options) {
      healthyCalls.push(options.url);
      return successfulResponse(fixture('crunchyroll-pt.xml'));
    } },
  });
  const primary = await healthy.fetch();
  assert.deepEqual(healthyCalls, [definition.feeds[0].url]);
  assert.equal(primary.articles[0].locale, 'pt-BR');
  assert.equal(primary.outcome, 'healthy');

  const fallbackCalls = [];
  const fallback = createRssProvider(definition, {
    httpClient: { getRss(options) {
      fallbackCalls.push(options.url);
      if (options.url === definition.feeds[0].url) {
        const error = new ProviderError('PROVIDER_HTTP_503', { retryable: true });
        error.attemptCount = 1;
        throw error;
      }
      return successfulResponse(fixture('crunchyroll-en.xml'));
    } },
  });
  const localizedFallback = await fallback.fetch();
  assert.deepEqual(fallbackCalls, definition.feeds.map((feed) => feed.url));
  assert.equal(localizedFallback.outcome, 'degraded');
  assert.equal(localizedFallback.articles[0].locale, 'en-US');
  assert.ok(localizedFallback.warnings.includes('LOCALE_FALLBACK_USED'));
});

test('stale cache is explicit degradation when a refresh fails', async () => {
  let nowMs = 1_000;
  let callCount = 0;
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.animetrending, {
    now: () => nowMs,
    httpClient: { getRss() {
      callCount += 1;
      if (callCount === 1) {
        return successfulResponse(fixture('animetrending.xml'), { 'cache-control': 'max-age=0' });
      }
      const error = new ProviderError('PROVIDER_TIMEOUT', { retryable: true });
      error.attemptCount = 3;
      throw error;
    } },
  });
  const first = await provider.fetch();
  nowMs += 1;
  const stale = await provider.fetch();
  assert.equal(stale.outcome, 'degraded');
  assert.equal(stale.cacheStatus, 'stale');
  assert.deepEqual(stale.articles, first.articles);
  assert.deepEqual(stale.warnings, ['STALE_CACHE_USED']);
});

test('concurrent source runs coalesce one in-flight feed request', async () => {
  let resolveRequest;
  let callCount = 0;
  const request = new Promise((resolve) => { resolveRequest = resolve; });
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: { getRss() { callCount += 1; return request; } },
  });
  const first = provider.fetch();
  const second = provider.fetch();
  assert.equal(first, second);
  assert.equal(callCount, 1);
  resolveRequest(successfulResponse(fixture('ann.xml')));
  await Promise.all([first, second]);
});

test('circuit opens after repeated provider failures and suppresses the next request', async () => {
  let callCount = 0;
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    now: () => 1_000,
    httpClient: { getRss() {
      callCount += 1;
      const error = new ProviderError('PROVIDER_TIMEOUT', { retryable: true });
      error.attemptCount = 3;
      throw error;
    } },
  });
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await provider.fetch()).outcome, 'failed');
  }
  const open = await provider.fetch();
  assert.equal(open.errorCode, 'PROVIDER_CIRCUIT_OPEN');
  assert.equal(callCount, 3);
});

test('valid empty RSS is healthy while invalid XML fails without a parser retry', async () => {
  let emptyCalls = 0;
  const empty = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: { getRss() {
      emptyCalls += 1;
      return successfulResponse('<rss version="2.0"><channel /></rss>');
    } },
  });
  const emptyResult = await empty.fetch();
  assert.equal(emptyResult.outcome, 'healthy');
  assert.deepEqual(emptyResult.articles, []);
  assert.equal(emptyCalls, 1);

  let invalidCalls = 0;
  const invalid = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: { getRss() {
      invalidCalls += 1;
      return successfulResponse('<rss><channel>');
    } },
  });
  const invalidResult = await invalid.fetch();
  assert.equal(invalidResult.outcome, 'failed');
  assert.equal(invalidResult.errorCode, 'PROVIDER_INVALID_XML');
  assert.equal(invalidCalls, 1);
});
