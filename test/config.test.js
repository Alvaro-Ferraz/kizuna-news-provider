'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig } = require('../src/config');
const { TEST_ARTICLE_REF_SECRET, TEST_SECRET } = require('./helpers');

test('development defaults to the four V1 sources', () => {
  const config = loadConfig({
    NODE_ENV: 'development',
    KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
    KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
  });
  assert.deepEqual(config.enabledSources, [
    'ann', 'animecorner', 'animetrending', 'crunchyroll',
  ]);
});

test('production requires an independent secret and explicit sources', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', PORT: '10000', ENABLED_SOURCES: 'ann' }),
    /Invalid secret/u,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      PORT: '10000',
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
    }),
    /ENABLED_SOURCES is required/u,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      PORT: '10000',
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      ENABLED_SOURCES: 'ann',
    }),
    /Invalid articleRefSecret/u,
  );
  assert.throws(
    () => loadConfig({
      NODE_ENV: 'production',
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
      ENABLED_SOURCES: 'ann',
    }),
    /PORT is required in production/u,
  );

  const valid = loadConfig({
    NODE_ENV: 'production',
    PORT: '10000',
    KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
    KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
    ENABLED_SOURCES: 'ann,animecorner,animetrending,crunchyroll',
  });
  assert.equal(valid.port, 10000);
});

test('configuration rejects short secrets, unknown sources, duplicates, and bad ports', () => {
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_SECRET,
    }),
    /Invalid articleRefSecret/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: 'short',
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
    }),
    /Invalid secret/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
      ENABLED_SOURCES: 'ann,unknown',
    }),
    /unsupported source/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
      ENABLED_SOURCES: 'ann,ann',
    }),
    /duplicate/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
      PORT: '3000x',
    }),
    /PORT must be an integer/u,
  );
});
