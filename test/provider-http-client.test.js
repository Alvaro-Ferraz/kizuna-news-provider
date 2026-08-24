'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ARTICLE_DEFAULTS,
  createProviderHttpClient,
  readBoundedBody,
} = require('../src/provider-http-client');

const feedUrl = 'https://feeds.example.test/news.xml';
const allowedHosts = ['feeds.example.test'];
const publicResolution = () => ({ address: '93.184.216.34', family: 4 });

function response(status, headers = {}, body = '') {
  return { status, headers, data: body };
}

function createMockClient(responses, overrides = {}) {
  const calls = [];
  const sleeps = [];
  const client = createProviderHttpClient({
    resolveHost: publicResolution,
    random: () => 0,
    sleep: (milliseconds) => { sleeps.push(milliseconds); },
    transport: (options) => {
      calls.push(options);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(options) : next;
    },
    ...overrides,
  });
  return { calls, client, sleeps };
}

test('HTTP client accepts bounded RSS 200 and forwards identifiable/conditional headers', async () => {
  const { calls, client } = createMockClient([
    response(200, { 'Content-Type': 'application/rss+xml; charset=UTF-8' }, '<rss />'),
  ]);
  const result = await client.getRss({
    url: feedUrl,
    allowedHosts,
    conditionalHeaders: { 'If-Modified-Since': 'Mon, 24 Aug 2026 00:00:00 GMT' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body, '<rss />');
  assert.equal(result.attemptCount, 1);
  assert.match(calls[0].headers['User-Agent'], /^Kizuna-News-Provider\//u);
  assert.equal(calls[0].headers['If-Modified-Since'], 'Mon, 24 Aug 2026 00:00:00 GMT');
  assert.equal(calls[0].maximumBytes, 1024 * 1024);
});

test('HTTP client treats 304 as success without requiring a content type', async () => {
  const { client } = createMockClient([response(304, { ETag: '"v1"' })]);
  const result = await client.getRss({ url: feedUrl, allowedHosts });
  assert.equal(result.status, 304);
  assert.equal(result.body, null);
  assert.equal(result.headers.etag, '"v1"');
});

test('HTTP client retries 429/5xx with bounded Retry-After and jittered backoff', async () => {
  const rateLimited = createMockClient([
    response(429, { 'Retry-After': '1' }),
    response(200, { 'Content-Type': 'application/xml' }, '<rss />'),
  ]);
  const rateResult = await rateLimited.client.getRss({ url: feedUrl, allowedHosts });
  assert.equal(rateResult.attemptCount, 2);
  assert.deepEqual(rateLimited.sleeps, [1000]);

  const unavailable = createMockClient([
    response(500), response(503), response(200, { 'Content-Type': 'text/xml' }, '<rss />'),
  ]);
  const unavailableResult = await unavailable.client.getRss({ url: feedUrl, allowedHosts });
  assert.equal(unavailableResult.attemptCount, 3);
  assert.deepEqual(unavailable.sleeps, [100, 200]);
});

test('HTTP client does not retry 403, bad content type, or oversize bodies', async () => {
  for (const [mockResponse, code] of [
    [response(403), 'PROVIDER_HTTP_403'],
    [response(200, { 'Content-Type': 'text/html' }, '<html />'), 'PROVIDER_INVALID_CONTENT_TYPE'],
    [response(200, { 'Content-Type': 'application/xml' }, 'x'.repeat(1025)), 'PROVIDER_RESPONSE_TOO_LARGE'],
  ]) {
    const { calls, client } = createMockClient([mockResponse], { maximumBytes: 1024 });
    await assert.rejects(
      () => client.getRss({ url: feedUrl, allowedHosts }),
      (error) => error.code === code,
    );
    assert.equal(calls.length, 1);
  }
});

test('HTTP client retries timeouts but never exceeds the attempt ceiling', async () => {
  const timeout = Object.assign(new Error('socket detail'), { code: 'ETIMEDOUT' });
  const { calls, client } = createMockClient([timeout, timeout, timeout]);
  await assert.rejects(
    () => client.getRss({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_TIMEOUT' && error.attemptCount === 3,
  );
  assert.equal(calls.length, 3);
});

test('HTTP client follows only allowlisted HTTPS redirects with a small hop ceiling', async () => {
  const allowed = createMockClient([
    response(301, { Location: '/canonical.xml' }),
    response(200, { 'Content-Type': 'application/xml' }, '<rss />'),
  ]);
  const result = await allowed.client.getRss({ url: feedUrl, allowedHosts });
  assert.equal(result.finalUrl, 'https://feeds.example.test/canonical.xml');
  assert.equal(allowed.calls.length, 2);

  const rejected = createMockClient([
    response(302, { Location: 'https://127.0.0.1/private' }),
  ]);
  await assert.rejects(
    () => rejected.client.getRss({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_REDIRECT_REJECTED',
  );
  assert.equal(rejected.calls.length, 1);
});

test('HTTP client fails instead of sleeping beyond the provider deadline', async () => {
  const { client, sleeps } = createMockClient([
    response(429, { 'Retry-After': '30' }),
  ], { now: () => 1_000, operationDeadlineMs: 15_000 });
  await assert.rejects(
    () => client.getRss({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_DEADLINE_EXCEEDED',
  );
  assert.deepEqual(sleeps, []);
});

test('total deadline aborts a transport that never responds', async () => {
  const client = createProviderHttpClient({
    resolveHost: publicResolution,
    operationDeadlineMs: 20,
    maximumAttempts: 1,
    transport: () => new Promise(() => {}),
  });
  await assert.rejects(
    () => client.getRss({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_DEADLINE_EXCEEDED',
  );
});

test('bounded reader counts streamed decompressed bytes, not declared compressed length', async () => {
  async function* decompressedBody() {
    yield Buffer.alloc(700);
    yield Buffer.alloc(400);
  }
  await assert.rejects(
    () => readBoundedBody(decompressedBody(), 1024),
    (error) => error.code === 'PROVIDER_RESPONSE_TOO_LARGE',
  );
});

test('HTTP client enforces two global requests and one request per host', async () => {
  let active = 0;
  let maximumActive = 0;
  const activeByHost = new Map();
  const maximumByHost = new Map();
  const client = createProviderHttpClient({
    resolveHost: publicResolution,
    transport: async ({ url }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const hostActive = (activeByHost.get(url.hostname) || 0) + 1;
      activeByHost.set(url.hostname, hostActive);
      maximumByHost.set(url.hostname, Math.max(maximumByHost.get(url.hostname) || 0, hostActive));
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      activeByHost.set(url.hostname, hostActive - 1);
      return response(200, { 'Content-Type': 'application/xml' }, '<rss />');
    },
  });
  const hosts = ['one.example.test', 'one.example.test', 'two.example.test', 'three.example.test'];
  await Promise.all(hosts.map((host, index) => client.getRss({
    url: `https://${host}/${index}.xml`,
    allowedHosts: [...new Set(hosts)],
  })));
  assert.equal(maximumActive, 2);
  assert.equal(maximumByHost.get('one.example.test'), 1);
});

test('article HTTP mode accepts only bounded HTML and uses article-specific limits', async () => {
  const { calls, client } = createMockClient([
    response(200, { 'Content-Type': 'text/html; charset=utf-8' }, '<article>safe</article>'),
  ], ARTICLE_DEFAULTS);
  const result = await client.getArticle({ url: feedUrl, allowedHosts });
  assert.equal(result.body, '<article>safe</article>');
  assert.equal(result.attemptCount, 1);
  assert.equal(calls[0].maximumBytes, 2 * 1024 * 1024);
  assert.equal(calls[0].timeoutMs, 15_000);
  assert.match(calls[0].headers.Accept, /text\/html/u);
});

test('article HTTP mode rejects non-HTML and oversize decompressed bodies without retry', async () => {
  for (const [mockResponse, code] of [
    [response(200, { 'Content-Type': 'application/pdf' }, 'pdf'), 'PROVIDER_INVALID_CONTENT_TYPE'],
    [response(200, { 'Content-Type': 'text/html' }, 'x'.repeat(1025)), 'PROVIDER_RESPONSE_TOO_LARGE'],
  ]) {
    const { calls, client } = createMockClient([mockResponse], {
      ...ARTICLE_DEFAULTS,
      maximumBytes: 1024,
    });
    await assert.rejects(
      () => client.getArticle({ url: feedUrl, allowedHosts }),
      (error) => error.code === code,
    );
    assert.equal(calls.length, 1);
  }
});

test('article HTTP mode retries only transient responses within its two-attempt deadline', async () => {
  const transient = createMockClient([
    response(429, { 'Retry-After': '1' }),
    response(200, { 'Content-Type': 'text/html' }, '<article>safe</article>'),
  ], ARTICLE_DEFAULTS);
  const result = await transient.client.getArticle({ url: feedUrl, allowedHosts });
  assert.equal(result.attemptCount, 2);
  assert.deepEqual(transient.sleeps, [1000]);

  for (const status of [403, 404]) {
    const rejected = createMockClient([response(status)], ARTICLE_DEFAULTS);
    await assert.rejects(
      () => rejected.client.getArticle({ url: feedUrl, allowedHosts }),
      (error) => error.code === (status === 403 ? 'PROVIDER_HTTP_403' : 'PROVIDER_HTTP_ERROR'),
    );
    assert.equal(rejected.calls.length, 1);
  }
});

test('article redirects repeat allowlist validation and retain the newly pinned DNS result', async () => {
  const resolutions = [];
  const calls = [];
  const client = createProviderHttpClient({
    ...ARTICLE_DEFAULTS,
    resolveHost: (hostname) => {
      resolutions.push(hostname);
      return hostname === 'feeds.example.test'
        ? { address: '93.184.216.34', family: 4 }
        : { address: '93.184.216.35', family: 4 };
    },
    transport: (options) => {
      calls.push(options);
      if (calls.length === 1) {
        return response(302, { Location: 'https://www.example.test/article' });
      }
      return response(200, { 'Content-Type': 'application/xhtml+xml' }, '<article>safe</article>');
    },
  });
  const result = await client.getArticle({
    url: feedUrl,
    allowedHosts: ['feeds.example.test', 'www.example.test'],
  });
  assert.deepEqual(resolutions, ['feeds.example.test', 'www.example.test']);
  assert.deepEqual(calls.map((call) => call.pinnedAddress.address), [
    '93.184.216.34', '93.184.216.35',
  ]);
  assert.equal(result.finalUrl, 'https://www.example.test/article');

  const rejected = createMockClient([
    response(302, { Location: 'http://feeds.example.test/insecure' }),
  ], ARTICLE_DEFAULTS);
  await assert.rejects(
    () => rejected.client.getArticle({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_REDIRECT_REJECTED',
  );
  assert.equal(rejected.calls.length, 1);

  const loop = createMockClient([
    response(302, { Location: '/one' }),
    response(302, { Location: '/two' }),
  ], { ...ARTICLE_DEFAULTS, maximumRedirects: 1 });
  await assert.rejects(
    () => loop.client.getArticle({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_TOO_MANY_REDIRECTS',
  );
  assert.equal(loop.calls.length, 2);
});

test('article HTTP mode performs DNS validation before transport and never falls back after rejection', async () => {
  let transportCalls = 0;
  const client = createProviderHttpClient({
    ...ARTICLE_DEFAULTS,
    maximumAttempts: 1,
    resolveHost: () => { throw new Error('PROVIDER_DNS_REJECTED'); },
    transport: () => { transportCalls += 1; },
  });
  await assert.rejects(
    () => client.getArticle({ url: feedUrl, allowedHosts }),
    (error) => error.code === 'PROVIDER_DNS_REJECTED',
  );
  assert.equal(transportCalls, 0);
});
