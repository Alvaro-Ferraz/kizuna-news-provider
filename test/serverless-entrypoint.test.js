'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { getBlockedNetworkAttemptCount } = require('./network-guard');

const repositoryRoot = path.resolve(__dirname, '..');
const TEST_SECRET = 'entrypoint-machine-secret-with-at-least-32-characters';
const TEST_ARTICLE_REF_SECRET = 'entrypoint-reference-secret-with-at-least-32-characters';

test('CommonJS Vercel entry exports one Express app without listening or network calls', () => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    ENABLED_SOURCES: process.env.ENABLED_SOURCES,
    KIZUNA_NEWS_PROVIDER_SECRET: process.env.KIZUNA_NEWS_PROVIDER_SECRET,
    KIZUNA_NEWS_ARTICLE_REF_SECRET: process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET,
  };
  const originalListen = http.Server.prototype.listen;
  const blockedBeforeImport = getBlockedNetworkAttemptCount();
  let listenCount = 0;

  http.Server.prototype.listen = function trackedListen(...args) {
    listenCount += 1;
    return originalListen.apply(this, args);
  };
  process.env.NODE_ENV = 'production';
  delete process.env.PORT;
  process.env.ENABLED_SOURCES = 'ann';
  process.env.KIZUNA_NEWS_PROVIDER_SECRET = TEST_SECRET;
  process.env.KIZUNA_NEWS_ARTICLE_REF_SECRET = TEST_ARTICLE_REF_SECRET;

  try {
    const { createApp } = require('../src/createApp');
    const serverModule = require('../server');
    const serverlessApp = require('../app');
    const config = {
      nodeEnv: 'test',
      port: 3000,
      secret: TEST_SECRET,
      articleRefSecret: TEST_ARTICLE_REF_SECRET,
      enabledSources: ['ann'],
      serviceVersion: '0.1.0-test',
      jsonBodyLimit: '16kb',
    };
    const firstFreshApp = createApp(config);
    const secondFreshApp = createApp(config);

    assert.equal(typeof createApp, 'function');
    assert.equal(typeof serverModule.startServer, 'function');
    assert.equal(typeof serverlessApp, 'function');
    assert.equal(typeof serverlessApp.handle, 'function');
    assert.notEqual(firstFreshApp, secondFreshApp);
    assert.equal(listenCount, 0);
    assert.equal(getBlockedNetworkAttemptCount(), blockedBeforeImport);
  } finally {
    http.Server.prototype.listen = originalListen;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Vercel configuration delegates only the root Express app to framework detection', () => {
  const packageMetadata = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const vercelConfig = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'),
  );

  assert.equal(packageMetadata.type, undefined);
  assert.equal(vercelConfig.fluid, true);
  assert.equal(vercelConfig.builds, undefined);
  assert.equal(vercelConfig.functions, undefined);
  assert.equal(vercelConfig.routes, undefined);
  assert.equal(vercelConfig.rewrites, undefined);
  assert.equal(JSON.stringify(vercelConfig).includes('src/app.js'), false);
});
