'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createLogger } = require('../src/logger');

test('structured logger includes stable metadata and redacts sensitive payload fields', () => {
  const originalInfo = console.info;
  const entries = [];
  console.info = (value) => entries.push(JSON.parse(value));
  try {
    createLogger().info('synthetic_event', {
      requestId: 'request-1',
      operation: 'synthetic',
      authorization: 'Bearer secret-value',
      articleRef: 'opaque.token',
      contentText: 'private article body',
      providerUrl: 'https://provider.example/private?query=secret',
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0].service, 'kizuna-news-provider');
  assert.equal(entries[0].level, 'info');
  assert.match(entries[0].timestamp, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(entries[0].requestId, 'request-1');
  assert.equal(entries[0].authorization, '[REDACTED]');
  assert.equal(entries[0].articleRef, '[REDACTED]');
  assert.equal(entries[0].contentText, '[REDACTED]');
  assert.equal(entries[0].providerUrl, '[REDACTED]');
  const serialized = JSON.stringify(entries[0]);
  assert.equal(serialized.includes('secret-value'), false);
  assert.equal(serialized.includes('private article body'), false);
  assert.equal(serialized.includes('provider.example'), false);
});
