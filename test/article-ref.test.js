'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  ARTICLE_REF_CLOCK_SKEW_MS,
  ARTICLE_REF_MAX_LENGTH,
  ARTICLE_REF_MAX_TTL_MS,
  ARTICLE_REF_TTL_MS,
  createArticleRefSigner,
  stableSerialize,
} = require('../src/article-ref');
const { TEST_ARTICLE_REF_SECRET } = require('./helpers');

const issuedAt = Date.parse('2026-08-24T12:00:00.000Z');
const validPayload = Object.freeze({
  version: 1,
  providerKey: 'ann',
  providerArticleId: 'ann-guid-1',
  canonicalSourceUrl: 'https://www.animenewsnetwork.com/news/example/.1',
  locale: 'en-US',
  issuedAt,
  expiresAt: issuedAt + ARTICLE_REF_TTL_MS,
});

function signRaw(payload) {
  const serialized = stableSerialize(payload);
  const signature = crypto.createHmac('sha256', TEST_ARTICLE_REF_SECRET)
    .update(serialized, 'utf8').digest('base64url');
  return `${Buffer.from(serialized).toString('base64url')}.${signature}`;
}

test('articleRef is deterministic HMAC-SHA256, versioned, opaque, and valid for 72 hours', () => {
  const signer = createArticleRefSigner({ secret: TEST_ARTICLE_REF_SECRET, now: () => issuedAt });
  const first = signer.sign(validPayload);
  const second = signer.sign(validPayload);
  assert.equal(first, second);
  assert.equal(first.split('.').length, 2);
  assert.equal(first.includes('animenewsnetwork'), false);
  assert.deepEqual(signer.verify(first), validPayload);
});

test('articleRef verification rejects tampered payloads, signatures, malformed and oversized input', () => {
  const signer = createArticleRefSigner({ secret: TEST_ARTICLE_REF_SECRET, now: () => issuedAt });
  const token = signer.sign(validPayload);
  const [payload, signature] = token.split('.');
  for (const invalid of [
    `${payload.slice(0, -1)}A.${signature}`,
    `${payload}.${signature.slice(0, -1)}A`,
    'not-a-token',
    'a.b.c',
    `a.${'x'.repeat(ARTICLE_REF_MAX_LENGTH)}`,
  ]) {
    assert.throws(() => signer.verify(invalid), /INVALID_ARTICLE_REF/u);
  }
});

test('articleRef rejects expired and future-issued tokens without regenerating them', () => {
  let clock = issuedAt;
  const signer = createArticleRefSigner({ secret: TEST_ARTICLE_REF_SECRET, now: () => clock });
  const token = signer.sign(validPayload);
  clock = issuedAt + ARTICLE_REF_TTL_MS + ARTICLE_REF_CLOCK_SKEW_MS + 1;
  assert.throws(() => signer.verify(token), /ARTICLE_REF_EXPIRED/u);

  const future = signRaw({
    ...validPayload,
    issuedAt: clock + ARTICLE_REF_CLOCK_SKEW_MS + 1,
    expiresAt: clock + ARTICLE_REF_TTL_MS,
  });
  assert.throws(() => signer.verify(future), /INVALID_ARTICLE_REF/u);
});

test('articleRef rejects unsupported versions, providers, URLs, locale, and excessive declared TTL', () => {
  const signer = createArticleRefSigner({ secret: TEST_ARTICLE_REF_SECRET, now: () => issuedAt });
  const cases = [
    [{ ...validPayload, version: 2 }, 'INVALID_ARTICLE_REF_VERSION'],
    [{ ...validPayload, providerKey: 'unknown' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'http://127.0.0.1/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://localhost/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://127.0.0.1/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://0.0.0.0/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://10.0.0.1/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://169.254.169.254/latest/meta-data' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://[::1]/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://[::ffff:127.0.0.1]/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://[fc00::1]/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, canonicalSourceUrl: 'https://evil.example/private' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, locale: 'not_a_locale' }, 'INVALID_ARTICLE_REF'],
    [{ ...validPayload, expiresAt: issuedAt + ARTICLE_REF_MAX_TTL_MS + 1 }, 'INVALID_ARTICLE_REF'],
  ];
  for (const [payload, code] of cases) {
    assert.throws(() => signer.verify(signRaw(payload)), new RegExp(code, 'u'));
  }
});
