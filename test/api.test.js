'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { SourceHealthStore } = require('../src/source-health-store');
const { createArticleRefSigner } = require('../src/article-ref');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  TEST_ARTICLE_REF_SECRET,
  TEST_SECRET,
  createTestConfig,
  createTestRegistry,
  startTestApp,
} = require('./helpers');

const authorization = { authorization: `Bearer ${TEST_SECRET}` };

function readJson(response) {
  return response.json();
}

test('public health is minimal and never fetches a provider', async (t) => {
  let fetchCount = 0;
  const sourceRegistry = createTestRegistry(Object.fromEntries(
    ['ann', 'animecorner', 'animetrending', 'crunchyroll'].map((key) => [key, () => {
      fetchCount += 1;
      return [];
    }]),
  ));
  const service = await startTestApp({ dependencies: { sourceRegistry } });
  t.after(() => service.close());

  const response = await service.request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), { status: 'ok' });
  assert.equal(fetchCount, 0);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('internal routes require the exact machine bearer and ignore cookies', async (t) => {
  const service = await startTestApp();
  t.after(() => service.close());

  for (const headers of [
    {},
    { authorization: 'Basic abc' },
    { authorization: 'Bearer wrong-secret' },
    { cookie: `session=${TEST_SECRET}` },
  ]) {
    const response = await service.request('/internal/v1/sources/health', { headers });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    const body = await readJson(response);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal(JSON.stringify(body).includes(TEST_SECRET), false);
  }

  const discovery = await service.request('/internal/v1/discovery-runs', { method: 'POST' });
  assert.equal(discovery.status, 401);
  assert.equal((await readJson(discovery)).error.code, 'UNAUTHORIZED');
});

test('valid bearer runs discovery and health remains a read-only snapshot', async (t) => {
  let fetchCount = 0;
  const sourceRegistry = createTestRegistry({
    ann: () => { fetchCount += 1; return []; },
  });
  const config = createTestConfig({ enabledSources: ['ann'] });
  const service = await startTestApp({ config, dependencies: { sourceRegistry } });
  t.after(() => service.close());

  const before = await service.request('/internal/v1/sources/health', { headers: authorization });
  assert.equal(before.status, 200);
  assert.equal(before.headers.get('access-control-allow-origin'), null);
  assert.equal((await readJson(before)).sources[0].status, 'unknown');
  assert.equal(fetchCount, 0);

  const discovery = await service.request('/internal/v1/discovery-runs', {
    method: 'POST', headers: authorization,
  });
  assert.equal(discovery.status, 200);
  assert.equal((await readJson(discovery)).sources[0].outcome, 'healthy');
  assert.equal(fetchCount, 1);

  const after = await service.request('/internal/v1/sources/health', { headers: authorization });
  assert.equal(after.status, 200);
  assert.equal((await readJson(after)).sources[0].status, 'healthy');
  assert.equal(fetchCount, 1);
});

test('discovery reports stable total-failure error without provider details', async (t) => {
  const sourceRegistry = createTestRegistry({
    ann: () => { throw new Error('private upstream failure detail'); },
  });
  const service = await startTestApp({
    config: createTestConfig({ enabledSources: ['ann'] }),
    dependencies: { sourceRegistry },
  });
  t.after(() => service.close());

  const response = await service.request('/internal/v1/discovery-runs', {
    method: 'POST', headers: authorization,
  });
  assert.equal(response.status, 502);
  const body = await readJson(response);
  assert.equal(body.error.code, 'ALL_SOURCES_FAILED');
  assert.equal(JSON.stringify(body).includes('private upstream'), false);
  assert.equal(JSON.stringify(body).includes('stack'), false);
});

test('JSON boundary rejects wrong types, unknown fields, malformed JSON, and large bodies', async (t) => {
  const service = await startTestApp();
  t.after(() => service.close());

  const cases = [
    {
      body: 'text',
      headers: { ...authorization, 'content-type': 'text/plain' },
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    {
      body: '{"unexpected":true}',
      headers: { ...authorization, 'content-type': 'application/json' },
      status: 400,
      code: 'INVALID_REQUEST',
    },
    {
      body: '{',
      headers: { ...authorization, 'content-type': 'application/json' },
      status: 400,
      code: 'INVALID_JSON',
    },
    {
      body: JSON.stringify({ value: 'x'.repeat(17 * 1024) }),
      headers: { ...authorization, 'content-type': 'application/json' },
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    },
  ];

  for (const item of cases) {
    const response = await service.request('/internal/v1/discovery-runs', {
      method: 'POST', headers: item.headers, body: item.body,
    });
    assert.equal(response.status, item.status);
    assert.equal((await readJson(response)).error.code, item.code);
  }
});

test('legacy product routes and landing page do not exist while browser preflight stays unauthorized', async (t) => {
  const service = await startTestApp();
  t.after(() => service.close());

  for (const [path, method] of [
    ['/', 'GET'],
    ['/api/news', 'GET'],
    ['/api/cache/clear', 'POST'],
  ]) {
    const response = await service.request(path, { method });
    assert.equal(response.status, 404);
    assert.equal((await readJson(response)).error.code, 'NOT_FOUND');
  }

  const preflight = await service.request('/internal/v1/discovery-runs', { method: 'OPTIONS' });
  assert.equal(preflight.status, 401);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
});

test('request IDs are constrained and unexpected errors use a safe envelope', async (t) => {
  const registry = createTestRegistry();
  const healthStore = new SourceHealthStore(Object.values(registry));
  healthStore.read = () => { throw new TypeError('sensitive implementation detail'); };
  const service = await startTestApp({ dependencies: { sourceRegistry: registry, healthStore } });
  t.after(() => service.close());

  const response = await service.request('/internal/v1/sources/health', {
    headers: { ...authorization, 'x-request-id': 'invalid request id with spaces' },
  });
  assert.equal(response.status, 500);
  const body = await readJson(response);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.notEqual(body.error.requestId, 'invalid request id with spaces');
  assert.equal(JSON.stringify(body).includes('sensitive'), false);
});

test('article extraction requires bearer plus strict JSON articleRef and never accepts a caller URL', async (t) => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const signer = createArticleRefSigner({
    secret: TEST_ARTICLE_REF_SECRET,
    now: () => now.getTime(),
  });
  const articleRef = signer.sign({
    providerKey: 'ann',
    providerArticleId: 'ann-guid-api',
    canonicalSourceUrl: 'https://www.animenewsnetwork.com/news/example/.1',
    locale: 'en-US',
  });
  let fetchCount = 0;
  const service = await startTestApp({
    config: createTestConfig({ enabledSources: ['ann'] }),
    dependencies: {
      now: () => now,
      articleHttpClient: {
        getArticle: () => {
          fetchCount += 1;
          return {
            body: readFileSync(path.join(__dirname, 'fixtures', 'ann-article.html'), 'utf8'),
            finalUrl: 'https://www.animenewsnetwork.com/news/example/.1',
            attemptCount: 1,
          };
        },
      },
    },
  });
  t.after(() => service.close());

  for (const request of [
    { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ articleRef }) },
    {
      headers: { cookie: `session=${TEST_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ articleRef }),
    },
    { headers: authorization, body: JSON.stringify({ articleRef }) },
    {
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.animenewsnetwork.com/news/example/.1' }),
    },
    {
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ articleRef, url: 'https://evil.example/' }),
    },
  ]) {
    const response = await service.request('/internal/v1/article-extractions', {
      method: 'POST', ...request,
    });
    assert.equal([400, 401, 415].includes(response.status), true);
  }
  assert.equal(fetchCount, 0);

  const invalid = await service.request('/internal/v1/article-extractions', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ articleRef: 'tampered.value' }),
  });
  assert.equal(invalid.status, 422);
  assert.equal((await readJson(invalid)).error.code, 'INVALID_ARTICLE_REF');
  assert.equal(fetchCount, 0);

  const valid = await service.request('/internal/v1/article-extractions', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ articleRef }),
  });
  assert.equal(valid.status, 200);
  const body = await readJson(valid);
  assert.equal(body.article.selectorVersion, 'ann-v1');
  assert.equal(body.article.contentText.includes('<'), false);
  assert.equal(Object.hasOwn(body, 'articleRef'), false);
  assert.equal(Object.hasOwn(body.article, 'html'), false);
  assert.equal(fetchCount, 1);
});
