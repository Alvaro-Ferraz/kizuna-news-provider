'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { loadConfig } = require('../src/config');
const { TEST_SECRET } = require('./helpers');

test('development defaults to the four V1 sources', () => {
  const config = loadConfig({
    NODE_ENV: 'development',
    KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
  });
  assert.deepEqual(config.enabledSources, [
    'ann', 'animecorner', 'animetrending', 'crunchyroll',
  ]);
});

test('production requires an independent secret and explicit sources', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', ENABLED_SOURCES: 'ann' }),
    /Invalid secret/u,
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET }),
    /ENABLED_SOURCES is required/u,
  );
});

test('configuration rejects short secrets, unknown sources, duplicates, and bad ports', () => {
  assert.throws(
    () => loadConfig({ KIZUNA_NEWS_PROVIDER_SECRET: 'short' }),
    /Invalid secret/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      ENABLED_SOURCES: 'ann,unknown',
    }),
    /unsupported source/u,
  );
  assert.throws(
    () => loadConfig({
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      ENABLED_SOURCES: 'ann,ann',
    }),
    /duplicate/u,
  );
  assert.throws(
    () => loadConfig({ KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET, PORT: '3000x' }),
    /PORT must be an integer/u,
  );
});
