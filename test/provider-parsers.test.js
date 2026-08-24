'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createArticleRefSigner } = require('../src/article-ref');
const { normalizeSourceArticles } = require('../src/discovery');
const { EXCERPT_LIMIT, ITEM_LIMIT, parseRss } = require('../src/rss-provider');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');
const { V1_SOURCE_METADATA } = require('../src/source-registry');

const fixtureDirectory = path.join(__dirname, 'fixtures');
const discoveredAt = '2026-08-24T12:00:00.000Z';
const articleRefSigner = createArticleRefSigner({
  secret: 'parser-test-article-ref-secret-at-least-32-characters',
  now: () => new Date(discoveredAt).getTime(),
});

function fixture(name) {
  return readFileSync(path.join(fixtureDirectory, name), 'utf8');
}

test('ANN parser preserves GUID, direct URL, excerpt, categories, and drops invalid items', async () => {
  const parsed = await parseRss(fixture('ann.xml'), V1_PROVIDER_DEFINITIONS.ann);
  assert.equal(parsed.articles.length, 2);
  assert.equal(parsed.articles[0].providerArticleId, 'ann-guid-001');
  assert.match(parsed.articles[0].sourceUrl, /^https:\/\/www\.animenewsnetwork\.com\//u);
  assert.equal(parsed.articles[0].excerpt, 'A short synthetic source teaser.');
  assert.deepEqual(parsed.articles[0].tags, ['Anime', 'Industry']);
  assert.equal(parsed.articles[0].language, 'en');
  assert.equal(parsed.articles[0].locale, 'en-US');
  assert.ok(parsed.warnings.includes('INVALID_ITEM_DROPPED'));
});

test('Anime Corner parser accepts empty excerpts and optional feed images', async () => {
  const parsed = await parseRss(
    fixture('animecorner.xml'),
    V1_PROVIDER_DEFINITIONS.animecorner,
  );
  assert.equal(parsed.articles.length, 2);
  assert.equal(parsed.articles[0].providerArticleId, 'corner-guid-001');
  assert.equal(parsed.articles[0].excerpt, 'Short corner teaser.');
  assert.equal(parsed.articles[0].imageUrl, 'https://animecorner.me/media/lantern.jpg');
  assert.equal(parsed.articles[1].excerpt, null);
  assert.equal(parsed.articles[1].imageUrl, null);
});

test('Anime Trending uses the canonical feed shape and never exposes encoded content as excerpt', async () => {
  const parsed = await parseRss(
    fixture('animetrending.xml'),
    V1_PROVIDER_DEFINITIONS.animetrending,
  );
  assert.equal(V1_PROVIDER_DEFINITIONS.animetrending.feeds[0].url, 'https://anitrendz.net/news/feed/');
  assert.equal(parsed.articles.length, 2);
  assert.equal(parsed.articles[0].excerpt, 'A bounded teaser for the visual announcement.');
  assert.equal(parsed.articles[0].excerpt.includes('rich feed'), false);
  assert.equal(parsed.articles[0].imageUrl, 'https://anitrendz.net/media/northwind-thumb.jpg');
  assert.equal(parsed.articles[1].imageUrl, null);
});

test('Crunchyroll localized fixtures preserve one GUID and correct language/locale', async () => {
  const definition = V1_PROVIDER_DEFINITIONS.crunchyroll;
  const portuguese = await parseRss(fixture('crunchyroll-pt.xml'), definition, definition.feeds[0]);
  const english = await parseRss(fixture('crunchyroll-en.xml'), definition, definition.feeds[1]);

  assert.equal(portuguese.articles[0].providerArticleId, english.articles[0].providerArticleId);
  assert.deepEqual([portuguese.articles[0].language, portuguese.articles[0].locale], ['pt', 'pt-BR']);
  assert.deepEqual([english.articles[0].language, english.articles[0].locale], ['en', 'en-US']);
  assert.equal(portuguese.articles[0].imageUrl, 'https://www.crunchyroll.com/img/aurora.jpg');
  assert.equal(portuguese.articles[0].excerpt.includes('Conteúdo rico'), false);

  const normalized = normalizeSourceArticles(
    [...portuguese.articles, ...english.articles],
    {
      providerKey: 'crunchyroll',
      ...V1_SOURCE_METADATA.crunchyroll,
      emptyResultAmbiguous: false,
    },
    discoveredAt,
    articleRefSigner,
  );
  assert.equal(normalized.articles.length, 1);
  assert.equal(normalized.articles[0].locale, 'pt-BR');
  assert.ok(normalized.warnings.includes('DUPLICATE_ITEM_DROPPED'));
});

test('RSS parser bounds excerpts, item counts, titles, and provider IDs', async () => {
  const definition = V1_PROVIDER_DEFINITIONS.ann;
  const longExcerpt = 'x'.repeat(EXCERPT_LIMIT + 50);
  const items = Array.from({ length: ITEM_LIMIT + 1 }, (_, index) => `
    <item><guid>id-${index}</guid><title>Title ${index}</title>
    <link>https://www.animenewsnetwork.com/news/${index}</link>
    <description>${index === 0 ? longExcerpt : 'short'}</description></item>`).join('');
  const parsed = await parseRss(`<rss version="2.0"><channel>${items}</channel></rss>`, definition);
  assert.equal(parsed.articles.length, ITEM_LIMIT);
  assert.equal(parsed.articles[0].excerpt.length, EXCERPT_LIMIT);
  assert.ok(parsed.warnings.includes('ITEM_LIMIT_REACHED'));
  assert.ok(parsed.warnings.includes('EXCERPT_TRUNCATED'));

  const hugeField = `<rss version="2.0"><channel><item><guid>${'g'.repeat(501)}</guid>
    <title>${'t'.repeat(501)}</title><link>https://www.animenewsnetwork.com/news/huge</link>
    </item></channel></rss>`;
  const hugeParsed = await parseRss(hugeField, definition);
  assert.equal(hugeParsed.articles.length, 0);
  assert.ok(hugeParsed.warnings.includes('INVALID_ITEM_DROPPED'));

  const noGuid = await parseRss(
    '<rss version="2.0"><channel><item><title>No GUID item</title>'
      + '<link>https://www.animenewsnetwork.com/news/no-guid</link></item></channel></rss>',
    definition,
  );
  assert.equal(noGuid.articles[0].providerArticleId, noGuid.articles[0].sourceUrl);
});

test('RSS parser rejects DOCTYPE, entities, malformed XML, unexpected roots, and HTML', async () => {
  const definition = V1_PROVIDER_DEFINITIONS.ann;
  for (const xml of [
    '<!DOCTYPE rss><rss version="2.0"><channel /></rss>',
    '<!ENTITY x SYSTEM "file:///etc/passwd"><rss version="2.0"><channel /></rss>',
    '<rss version="2.0"><channel><item></rss>',
    '<feed><entry /></feed>',
    '<html><body>challenge</body></html>',
  ]) {
    await assert.rejects(() => parseRss(xml, definition), /PROVIDER_/u);
  }
});
