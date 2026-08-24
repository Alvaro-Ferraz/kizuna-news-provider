'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

test('importing app, config, registry, process entry, and serverless entry starts no work', () => {
  const originalListen = http.Server.prototype.listen;
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ENABLED_SOURCES: process.env.ENABLED_SOURCES,
    KIZUNA_NEWS_PROVIDER_SECRET: process.env.KIZUNA_NEWS_PROVIDER_SECRET,
    KIZUNA_NEWS_ARTICLE_REF_SECRET: process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET,
  };
  let listenCount = 0;
  http.Server.prototype.listen = function trackedListen(...args) {
    listenCount += 1;
    return originalListen.apply(this, args);
  };

  try {
    assert.doesNotThrow(() => require('../src/config'));
    assert.doesNotThrow(() => require('../src/source-registry'));
    assert.doesNotThrow(() => require('../src/app'));
    assert.doesNotThrow(() => require('../server'));
    process.env.NODE_ENV = 'production';
    process.env.ENABLED_SOURCES = 'ann';
    process.env.KIZUNA_NEWS_PROVIDER_SECRET = 'import-machine-secret-with-at-least-32-characters';
    process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET = 'import-reference-secret-with-at-least-32-characters';
    assert.doesNotThrow(() => require('../app'));
    assert.equal(listenCount, 0);
  } finally {
    http.Server.prototype.listen = originalListen;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
