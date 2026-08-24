'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const test = require('node:test');

const {
  createShutdownController,
  startServer,
} = require('../server');
const {
  TEST_ARTICLE_REF_SECRET,
  TEST_SECRET,
  silentLogger,
} = require('./helpers');

async function unusedPort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

test('production start validates first and binds the configured port on all interfaces', async (t) => {
  const port = await unusedPort();
  const server = startServer({
    env: {
      NODE_ENV: 'production',
      PORT: String(port),
      ENABLED_SOURCES: 'ann,animecorner,animetrending,crunchyroll',
      KIZUNA_NEWS_PROVIDER_SECRET: TEST_SECRET,
      KIZUNA_NEWS_ARTICLE_REF_SECRET: TEST_ARTICLE_REF_SECRET,
    },
    dependencies: { logger: silentLogger },
  });
  t.after(() => server.close());
  await once(server, 'listening');
  assert.equal(server.address().address, '0.0.0.0');
  assert.equal(server.address().port, port);
});

test('shutdown stops admission, lets in-flight work finish, and ignores duplicate signals', async () => {
  let releaseRequest;
  let markRequestArrived;
  const pending = new Promise((resolve) => { releaseRequest = resolve; });
  const requestArrived = new Promise((resolve) => { markRequestArrived = resolve; });
  const server = http.createServer(async (_request, response) => {
    markRequestArrived();
    await pending;
    response.end('done');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const activeRequest = new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
  await requestArrived;

  let exitCode = null;
  const controller = createShutdownController({
    server,
    shutdownTimeoutMs: 2_000,
    exit: (code) => { exitCode = code; },
    log: silentLogger,
  });
  assert.equal(controller.shutdown('SIGTERM'), true);
  assert.equal(controller.shutdown('SIGINT'), false);
  await assert.rejects(() => fetch(`http://127.0.0.1:${port}/`));
  assert.equal(exitCode, null);

  const closed = once(server, 'close');
  releaseRequest();
  const activeResponse = await activeRequest;
  assert.equal(activeResponse.status, 200);
  assert.equal(activeResponse.body, 'done');
  await closed;
  assert.equal(exitCode, 0);
});

test('shutdown deadline force-closes connections and exits non-zero', async () => {
  let forced = 0;
  let exitCode = null;
  const server = {
    close() {},
    closeAllConnections() { forced += 1; },
  };
  const controller = createShutdownController({
    server,
    shutdownTimeoutMs: 10,
    exit: (code) => { exitCode = code; },
    log: silentLogger,
  });
  controller.shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(forced, 1);
  assert.equal(exitCode, 1);
});
