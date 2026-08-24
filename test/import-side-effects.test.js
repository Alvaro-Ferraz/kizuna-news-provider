'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

test('importing app, config, registry, and server never starts a listener', () => {
  const originalListen = http.Server.prototype.listen;
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
    assert.equal(listenCount, 0);
  } finally {
    http.Server.prototype.listen = originalListen;
  }
});
