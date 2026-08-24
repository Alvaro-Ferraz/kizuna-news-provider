'use strict';

const { once } = require('node:events');

const { createApp } = require('../src/app');
const { V1_SOURCE_KEYS, V1_SOURCE_METADATA } = require('../src/source-registry');

const TEST_SECRET = 'test-machine-secret-with-at-least-32-characters';
const TEST_ARTICLE_REF_SECRET = 'test-article-ref-secret-with-at-least-32-characters';
const silentLogger = Object.freeze({ info() {}, error() {} });

function createTestConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    port: 3000,
    secret: TEST_SECRET,
    articleRefSecret: TEST_ARTICLE_REF_SECRET,
    enabledSources: [...V1_SOURCE_KEYS],
    serviceVersion: '0.1.0-test',
    jsonBodyLimit: '16kb',
    ...overrides,
  };
}

function createRawArticle(providerKey, overrides = {}) {
  const host = V1_SOURCE_METADATA[providerKey].allowedSourceHosts[0];
  return {
    title: `Article from ${providerKey}`,
    link: `https://${host}/news/${providerKey}`,
    excerpt: '<p>Safe summary</p>',
    date: '2026-08-24T12:00:00.000Z',
    image: 'https://images.example.test/image.jpg',
    tags: ['anime', 'news'],
    language: 'en',
    locale: 'en-US',
    discoveryMethod: V1_SOURCE_METADATA[providerKey].discoveryMethod,
    ...overrides,
  };
}

function createTestRegistry(fetchByKey = {}) {
  return Object.fromEntries(V1_SOURCE_KEYS.map((providerKey) => [providerKey, {
    providerKey,
    ...V1_SOURCE_METADATA[providerKey],
    emptyResultAmbiguous: false,
    fetch: fetchByKey[providerKey] || (() => [createRawArticle(providerKey)]),
  }]));
}

async function startTestApp({ config, dependencies } = {}) {
  const app = createApp(config || createTestConfig(), {
    logger: silentLogger,
    sourceRegistry: createTestRegistry(),
    ...dependencies,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  return {
    request(path, options) {
      return fetch(`http://127.0.0.1:${port}${path}`, options);
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}

module.exports = {
  TEST_ARTICLE_REF_SECRET,
  TEST_SECRET,
  createRawArticle,
  createTestConfig,
  createTestRegistry,
  silentLogger,
  startTestApp,
};
