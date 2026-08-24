'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONTRACT_LIMITS,
  articleExtractionRequestSchema,
  articleExtractionResponseSchema,
  sourceArticleSchema,
} = require('../src/contracts');

function validArticle(overrides = {}) {
  return {
    schemaVersion: 2,
    providerKey: 'ann',
    sourceDisplayName: 'Anime News Network',
    providerArticleId: null,
    providerSlug: null,
    articleRef: 'opaque.signed.value',
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

function validExtraction(overrides = {}) {
  return {
    schemaVersion: 1,
    serviceVersion: '5.1.0-test',
    extractedAt: '2026-08-24T12:00:00.000Z',
    article: {
      providerKey: 'ann',
      providerArticleId: null,
      sourceUrl: 'https://www.animenewsnetwork.com/news/1',
      finalUrl: 'https://www.animenewsnetwork.com/news/1',
      canonicalUrl: null,
      title: null,
      author: null,
      publishedAt: null,
      language: 'en',
      selectorVersion: 'ann-v1',
      contentText: 'Synthetic plain article text.',
      blocks: [{ type: 'paragraph', text: 'Synthetic plain article text.' }],
      warnings: ['AUTHOR_NOT_FOUND'],
      ...overrides,
    },
  };
}

test('ArticleExtraction contracts accept only articleRef input and strict text-only output', () => {
  assert.equal(articleExtractionRequestSchema.safeParse({ articleRef: 'opaque.ref' }).success, true);
  for (const request of [
    {},
    { url: 'https://www.animenewsnetwork.com/news/1' },
    { articleRef: 'opaque.ref', providerKey: 'ann' },
    { articleRef: 'x'.repeat(CONTRACT_LIMITS.articleRef + 1) },
  ]) {
    assert.equal(articleExtractionRequestSchema.safeParse(request).success, false);
  }
  assert.deepEqual(articleExtractionResponseSchema.parse(validExtraction()), validExtraction());
});

test('ArticleExtraction response rejects HTML fields, invalid URLs/dates, and oversized text', () => {
  for (const response of [
    validExtraction({ contentHtml: '<p>unsafe</p>' }),
    validExtraction({ finalUrl: 'http://127.0.0.1/private' }),
    validExtraction({ publishedAt: 'yesterday' }),
    validExtraction({ contentText: 'x'.repeat(CONTRACT_LIMITS.articleContentText + 1) }),
    validExtraction({ blocks: [{ type: 'html', text: '<p>unsafe</p>' }] }),
  ]) {
    assert.equal(articleExtractionResponseSchema.safeParse(response).success, false);
  }
});
