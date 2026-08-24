'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { CONTRACT_LIMITS, sourceArticleSchema } = require('../src/contracts');

function validArticle(overrides = {}) {
  return {
    schemaVersion: 1,
    providerKey: 'ann',
    sourceDisplayName: 'Anime News Network',
    providerArticleId: null,
    providerSlug: null,
    title: 'A valid title',
    excerpt: null,
    publishedAt: null,
    sourceUrl: 'https://www.animenewsnetwork.com/news/1',
    imageUrl: null,
    tags: ['anime'],
    language: null,
    locale: null,
    discoveryMethod: 'DIRECT_RSS',
    discoveredAt: '2026-08-24T12:00:00.000Z',
    ...overrides,
  };
}

test('SourceArticle runtime schema accepts the documented nullable shape', () => {
  assert.deepEqual(sourceArticleSchema.parse(validArticle()), validArticle());
});

test('SourceArticle rejects unknown providers and oversized titles', () => {
  assert.equal(sourceArticleSchema.safeParse(validArticle({ providerKey: 'other' })).success, false);
  assert.equal(sourceArticleSchema.safeParse(validArticle({
    title: 'x'.repeat(CONTRACT_LIMITS.title + 1),
  })).success, false);
});

test('SourceArticle rejects unsafe URLs, bad locale, bad method, and invalid dates', () => {
  for (const overrides of [
    { sourceUrl: 'http://www.animenewsnetwork.com/news/1' },
    { sourceUrl: 'javascript:alert(1)' },
    { locale: 'not_a_locale' },
    { discoveryMethod: 'SCRAPE' },
    { publishedAt: 'yesterday' },
  ]) {
    assert.equal(sourceArticleSchema.safeParse(validArticle(overrides)).success, false);
  }
});

test('SourceArticle rejects excessive tags and unknown payload fields', () => {
  assert.equal(sourceArticleSchema.safeParse(validArticle({
    tags: Array.from({ length: CONTRACT_LIMITS.tags + 1 }, (_, index) => `tag-${index}`),
  })).success, false);
  assert.equal(sourceArticleSchema.safeParse(validArticle({ contentHtml: '<p>raw</p>' })).success, false);
});
