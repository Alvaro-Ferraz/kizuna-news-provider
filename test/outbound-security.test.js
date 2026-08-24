'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isPublicIp,
  resolvePublicAddress,
  validateOutboundUrl,
} = require('../src/outbound-security');

test('public-address validation rejects local, private, link-local, metadata, mapped, and reserved IPs', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ]) {
    assert.equal(isPublicIp(address), false, address);
  }
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});

test('outbound URL validation requires HTTPS, exact host allowlist, and no credentials', () => {
  const allowedHosts = ['feeds.example.test'];
  assert.equal(
    validateOutboundUrl('https://feeds.example.test/rss', allowedHosts).hostname,
    'feeds.example.test',
  );
  for (const value of [
    'http://feeds.example.test/rss',
    'https://localhost/rss',
    'https://127.0.0.1/rss',
    'https://unknown.example.test/rss',
    'https://user:password@feeds.example.test/rss',
  ]) {
    assert.throws(() => validateOutboundUrl(value, allowedHosts), /PROVIDER_/u);
  }
});

test('DNS validation rejects a hostname if any answer enters a blocked range', async () => {
  const mixedLookup = () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  await assert.rejects(
    () => resolvePublicAddress('feeds.example.test', mixedLookup),
    /PROVIDER_DNS_REJECTED/u,
  );

  const publicLookup = () => [{ address: '8.8.8.8', family: 4 }];
  assert.deepEqual(
    await resolvePublicAddress('feeds.example.test', publicLookup),
    { address: '8.8.8.8', family: 4 },
  );
});
