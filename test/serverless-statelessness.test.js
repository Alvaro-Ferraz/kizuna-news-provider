'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const { createApp } = require('../src/createApp');
const { createRssProvider } = require('../src/rss-provider');
const { createV1SourceRegistry } = require('../src/source-registry');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');
const {
  TEST_SECRET,
  createTestConfig,
  createTestRegistry,
  startTestApp,
} = require('./helpers');

const authorization = { authorization: `Bearer ${TEST_SECRET}` };
const instant = new Date('2026-08-24T12:00:00.000Z');
const articleHtml = readFileSync(path.join(__dirname, 'fixtures', 'ann-article.html'), 'utf8');
const annRss = readFileSync(path.join(__dirname, 'fixtures', 'ann.xml'), 'utf8');

test('articleRef issued by instance A extracts on fresh instance B with the same secret', async (t) => {
  const config = createTestConfig({ enabledSources: ['ann'] });
  const instanceA = await startTestApp({
    config,
    dependencies: { sourceRegistry: createTestRegistry(), now: () => instant },
  });
  t.after(() => instanceA.close());

  const discovery = await instanceA.request('/internal/v1/discovery-runs', {
    method: 'POST', headers: authorization,
  });
  const articleRef = (await discovery.json()).articles[0].articleRef;

  let articleFetches = 0;
  const instanceB = await startTestApp({
    config,
    dependencies: {
      sourceRegistry: createTestRegistry(),
      now: () => instant,
      articleHttpClient: {
        getArticle() {
          articleFetches += 1;
          return {
            body: articleHtml,
            finalUrl: 'https://www.animenewsnetwork.com/news/ann',
            attemptCount: 1,
          };
        },
      },
    },
  });
  t.after(() => instanceB.close());

  const extraction = await instanceB.request('/internal/v1/article-extractions', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ articleRef }),
  });
  assert.equal(extraction.status, 200);
  assert.equal((await extraction.json()).article.providerKey, 'ann');
  assert.equal(articleFetches, 1);
});

test('fresh app health is unknown even after another app completes discovery', async (t) => {
  const config = createTestConfig({ enabledSources: ['ann'] });
  const instanceA = await startTestApp({ config });
  const instanceB = await startTestApp({ config });
  t.after(() => Promise.all([instanceA.close(), instanceB.close()]));

  const discovery = await instanceA.request('/internal/v1/discovery-runs', {
    method: 'POST', headers: authorization,
  });
  assert.equal(discovery.status, 200);

  const firstHealth = await instanceA.request('/internal/v1/sources/health', {
    headers: authorization,
  });
  const freshHealth = await instanceB.request('/internal/v1/sources/health', {
    headers: authorization,
  });
  assert.equal((await firstHealth.json()).sources[0].status, 'healthy');
  assert.equal((await freshHealth.json()).sources[0].status, 'unknown');
});

test('cold RSS instance succeeds without cache or conditional validators', async () => {
  const calls = [];
  const provider = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: {
      getRss(options) {
        calls.push(options);
        return { status: 200, body: annRss, headers: {}, attemptCount: 1 };
      },
    },
  });
  const result = await provider.fetch();
  assert.notEqual(result.outcome, 'failed');
  assert.equal(result.articles.length > 0, true);
  assert.deepEqual(calls[0].conditionalHeaders, {});
});

test('circuit and coalescing state are local and never required across instances', async () => {
  let failedCalls = 0;
  const failing = createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    now: () => instant.getTime(),
    httpClient: {
      getRss() {
        failedCalls += 1;
        throw Object.assign(new Error('failed'), { code: 'PROVIDER_TIMEOUT', attemptCount: 1 });
      },
    },
  });
  for (let index = 0; index < 3; index += 1) await failing.fetch();
  assert.equal((await failing.fetch()).errorCode, 'PROVIDER_CIRCUIT_OPEN');
  assert.equal(failedCalls, 3);

  let resolveFirst;
  let resolveSecond;
  let independentCalls = 0;
  const makeProvider = (pending) => createRssProvider(V1_PROVIDER_DEFINITIONS.ann, {
    httpClient: {
      async getRss() {
        independentCalls += 1;
        await pending;
        return { status: 200, body: annRss, headers: {}, attemptCount: 1 };
      },
    },
  });
  const firstPending = new Promise((resolve) => { resolveFirst = resolve; });
  const secondPending = new Promise((resolve) => { resolveSecond = resolve; });
  const freshA = makeProvider(firstPending);
  const freshB = makeProvider(secondPending);
  const operations = [freshA.fetch(), freshA.fetch(), freshB.fetch(), freshB.fetch()];
  assert.equal(independentCalls, 2);
  resolveFirst();
  resolveSecond();
  const results = await Promise.all(operations);
  assert.equal(results.every((result) => result.outcome !== 'failed'), true);
});

test('serverless entry routes health and protected endpoints without PORT or its own listener', async (t) => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    ENABLED_SOURCES: process.env.ENABLED_SOURCES,
    KIZUNA_NEWS_PROVIDER_SECRET: process.env.KIZUNA_NEWS_PROVIDER_SECRET,
    KIZUNA_NEWS_ARTICLE_REF_SECRET: process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET,
  };
  process.env.NODE_ENV = 'production';
  delete process.env.PORT;
  process.env.ENABLED_SOURCES = 'ann';
  process.env.KIZUNA_NEWS_PROVIDER_SECRET = TEST_SECRET;
  process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET = createTestConfig().articleRefSecret;
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const serverlessApp = require('../app');
  assert.equal(typeof serverlessApp, 'function');
  const server = http.createServer(serverlessApp);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  const rejected = await fetch(`${baseUrl}/internal/v1/sources/health`);
  assert.equal(rejected.status, 401);
  const authorized = await fetch(`${baseUrl}/internal/v1/sources/health`, {
    headers: authorization,
  });
  assert.equal(authorized.status, 200);
});

test('independent createApp calls construct distinct operational state', () => {
  const config = createTestConfig({ enabledSources: ['ann'] });
  const first = createApp(config, { sourceRegistry: createTestRegistry() });
  const second = createApp(config, { sourceRegistry: createTestRegistry() });
  assert.notEqual(first, second);

  const firstRegistry = createV1SourceRegistry();
  const secondRegistry = createV1SourceRegistry();
  assert.notEqual(firstRegistry.ann.fetch, secondRegistry.ann.fetch);
});
