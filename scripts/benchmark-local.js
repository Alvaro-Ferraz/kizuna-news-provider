'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { createArticleExtractionService } = require('../src/article-extraction-service');
const { createArticleRefSigner } = require('../src/article-ref');
const { createDiscoveryService } = require('../src/discovery');
const { SourceHealthStore } = require('../src/source-health-store');
const {
  TEST_ARTICLE_REF_SECRET,
  TEST_SECRET,
  createTestConfig,
  createTestRegistry,
  silentLogger,
} = require('../test/helpers');

async function unusedPort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function measureColdStart() {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      ENABLED_SOURCES: 'ann,animecorner,animetrending,crunchyroll',
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
    },
    stdio: 'ignore',
  });
  const startedAt = performance.now();
  const deadline = startedAt + 5_000;
  try {
    while (performance.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.status === 200) return Math.round(performance.now() - startedAt);
      } catch {
        // Process is not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Cold-start health deadline exceeded');
  } finally {
    child.kill();
    await once(child, 'exit');
  }
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMiB: Number((usage.rss / 1024 / 1024).toFixed(2)),
    heapUsedMiB: Number((usage.heapUsed / 1024 / 1024).toFixed(2)),
  };
}

async function runSyntheticOperations() {
  const config = createTestConfig();
  const sourceRegistry = createTestRegistry();
  const discovery = createDiscoveryService({
    config,
    sourceRegistry,
    healthStore: new SourceHealthStore(Object.values(sourceRegistry)),
    logger: silentLogger,
  });
  const instant = new Date();
  const articleRef = createArticleRefSigner({
    secret: TEST_ARTICLE_REF_SECRET,
    now: () => instant.getTime(),
  }).sign({
    providerKey: 'ann',
    providerArticleId: 'synthetic-benchmark',
    canonicalSourceUrl: 'https://www.animenewsnetwork.com/news/synthetic/.1',
    locale: 'en-US',
  });
  const html = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'ann-article.html'), 'utf8');
  const extraction = createArticleExtractionService({
    config,
    sourceRegistry,
    logger: silentLogger,
    now: () => instant,
    httpClient: { getArticle: () => ({
      body: html,
      finalUrl: 'https://www.animenewsnetwork.com/news/synthetic/.1',
      attemptCount: 1,
    }) },
  });

  const before = memorySnapshot();
  const discoveryDurations = [];
  const extractionDurations = [];
  for (let index = 0; index < 30; index += 1) {
    let startedAt = performance.now();
    await discovery.run();
    discoveryDurations.push(performance.now() - startedAt);
    startedAt = performance.now();
    await extraction.extract({ articleRef, requestId: `benchmark-${index}` });
    extractionDurations.push(performance.now() - startedAt);
  }
  const after = memorySnapshot();
  return {
    iterations: 30,
    memoryBefore: before,
    memoryAfter: after,
    discoveryMedianMs: median(discoveryDurations),
    extractionMedianMs: median(extractionDurations),
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.floor(sorted.length / 2)].toFixed(2));
}

async function run() {
  const coldStarts = [];
  for (let index = 0; index < 5; index += 1) coldStarts.push(await measureColdStart());
  const synthetic = await runSyntheticOperations();
  console.info(JSON.stringify({
    measurementType: 'LOCAL/SYNTHETIC',
    nodeVersion: process.version,
    coldStartMs: {
      samples: coldStarts,
      min: Math.min(...coldStarts),
      median: median(coldStarts),
      max: Math.max(...coldStarts),
    },
    synthetic,
  }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
