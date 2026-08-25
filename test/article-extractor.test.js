'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  ARTICLE_EXTRACTION_DEFINITIONS,
  ARTICLE_EXTRACTION_SELECTOR_REGISTRY,
} = require('../src/article-extraction-definitions');
const { extractArticle, extractCrunchyrollStory } = require('../src/article-extractor');
const { CONTRACT_LIMITS } = require('../src/contracts');

const fixtureDirectory = path.join(__dirname, 'fixtures');
const cases = [
  ['ann', 'ann-article-v2.html', 'https://www.animenewsnetwork.com/news/2026-08-25/synthetic/.240972', 'ann-v2'],
  ['animecorner', 'animecorner-article.html', 'https://animecorner.me/northern-lights-project/', 'animecorner-v1'],
  ['animetrending', 'animetrending-article-v2.html', 'https://anitrendz.net/news/2026/08/25/synthetic-current-layout/', 'animetrending-v2'],
  ['crunchyroll', 'crunchyroll-article.html', 'https://www.crunchyroll.com/pt-br/news/latest/example', 'crunchyroll-v1'],
  ['myanimelist', 'myanimelist-article.html', 'https://myanimelist.net/news/70000001', 'myanimelist-v1'],
  ['otakuusa', 'otakuusa-article.html', 'https://otakuusamagazine.com/synthetic-news/', 'otakuusa-v1'],
  ['animeherald', 'animeherald-article.html', 'https://www.animeherald.com/2026/08/25/synthetic-news/', 'animeherald-v1'],
];

test('provider-specific extractors return semantic text blocks and remove known noise', () => {
  for (const [providerKey, fixture, url, selectorVersion] of cases) {
    const result = extractArticle({
      providerKey,
      html: readFileSync(path.join(fixtureDirectory, fixture), 'utf8'),
      sourceUrl: url,
      finalUrl: url,
      locale: providerKey === 'crunchyroll' ? 'pt-BR' : 'en-US',
    });
    assert.equal(result.selectorVersion, selectorVersion);
    assert.ok(result.title);
    assert.ok(result.author);
    if (providerKey === 'myanimelist') {
      assert.ok(result.warnings.includes('PUBLISHED_AT_NOT_FOUND'));
    } else {
      assert.ok(result.publishedAt);
    }
    assert.ok(result.contentText.length >= 200);
    if (providerKey === 'myanimelist') {
      assert.ok(result.blocks.every((block) => block.type === 'paragraph'));
    } else {
      assert.ok(result.blocks.some((block) => block.type === 'heading'));
      assert.ok(result.blocks.some((block) => block.type === 'list' || block.type === 'quote'));
    }
    assert.equal(/noise|subscribe|promoção|conteúdo relacionado/iu.test(result.contentText), false);
    assert.equal(Object.hasOwn(result, 'html'), false);
    assert.equal(Object.hasOwn(result, 'rawHtml'), false);
  }
});

test('historical ANN and Anime Trending V1 fixtures remain supported', () => {
  for (const [providerKey, fixtureName, sourceUrl, selectorVersion] of [
    ['ann', 'ann-article.html', 'https://www.animenewsnetwork.com/news/example/.1', 'ann-v1'],
    ['animetrending', 'animetrending-article.html',
      'https://anitrendz.net/news/windward-anime-update/', 'animetrending-v1'],
  ]) {
    const result = extractArticle({
      providerKey,
      html: readFileSync(path.join(fixtureDirectory, fixtureName), 'utf8'),
      sourceUrl,
      finalUrl: sourceUrl,
      locale: 'en-US',
    });
    assert.equal(result.selectorVersion, selectorVersion);
  }
});

test('malicious HTML is discarded without scripts, subresource loading, links, or executable markup', () => {
  const subresourceRequests = 0;
  const html = `<html lang="en"><body><article><h1 class="entry-title">Safe title</h1>
    <div class="entry-content"><p>This is a sufficiently long editorial paragraph describing a synthetic announcement and its production context for extraction testing.</p>
    <p>Another paragraph provides enough useful information to pass the conservative minimum while remaining completely synthetic.</p>
    <script>subresourceRequests += 1</script><img src="https://evil.test/pixel" onerror="bad()">
    <p><a href="javascript:bad()">Visible safe anchor text</a></p><svg onload="bad()"><text>svg bad</text></svg>
    <object data="https://evil.test/object"></object><iframe src="https://evil.test/frame"></iframe>
    <form><input value="secret"><button>submit</button></form><p>&amp;lt;script&amp;gt;encoded&amp;lt;/script&amp;gt;</p>
    </div></article></body></html>`;
  const result = extractArticle({
    providerKey: 'animecorner',
    html,
    sourceUrl: 'https://animecorner.me/safe/',
    finalUrl: 'https://animecorner.me/safe/',
    locale: 'en-US',
  });
  assert.equal(subresourceRequests, 0);
  assert.equal(/<script|javascript:|onerror|onload|<iframe|<object|<form/iu.test(result.contentText), false);
  assert.ok(result.contentText.includes('Visible safe anchor text'));
  assert.equal(JSON.stringify(result).includes('evil.test'), false);
});

test('crunchyroll-v2 extracts sanitized Storyblok rich text for the current interview layout', () => {
  const sourceUrl = 'https://www.crunchyroll.com/pt-br/news/interviews/2026/8/24/entrevista-sintetica';
  const result = extractCrunchyrollStory({
    storyJson: readFileSync(path.join(fixtureDirectory, 'crunchyroll-story-v2.json'), 'utf8'),
    sourceUrl,
    finalUrl: sourceUrl,
    locale: 'pt-BR',
  });
  assert.equal(result.selectorVersion, 'crunchyroll-v2');
  assert.equal(result.title, 'Entrevista sintética sobre produção de anime');
  assert.equal(result.author, 'Redação sintética');
  assert.equal(result.publishedAt, '2026-08-24T10:30:00.000Z');
  assert.equal(result.language, 'pt-BR');
  assert.ok(result.contentText.length >= 200);
  assert.deepEqual(new Set(result.blocks.map((block) => block.type)), new Set([
    'heading', 'paragraph', 'list', 'quote',
  ]));
  assert.equal(result.contentText.includes('ignored-video-id'), false);
  assert.equal(result.contentText.includes('images.example.test'), false);
  assert.equal(JSON.stringify(result).includes('<'), false);
});

test('crunchyroll-v2 fails closed when the Storyblok template is unknown', () => {
  const payload = JSON.parse(
    readFileSync(path.join(fixtureDirectory, 'crunchyroll-story-v2.json'), 'utf8'),
  );
  payload.story.content.article_type = 'unknown-template';
  assert.throws(() => extractCrunchyrollStory({
    storyJson: payload,
    sourceUrl: 'https://www.crunchyroll.com/pt-br/news/interviews/2026/8/24/entrevista-sintetica',
    finalUrl: 'https://www.crunchyroll.com/pt-br/news/interviews/2026/8/24/entrevista-sintetica',
    locale: 'pt-BR',
  }), /ARTICLE_LAYOUT_UNSUPPORTED/u);
});

test('V1 extraction fails closed when its provider-specific article root disappears', () => {
  assert.throws(() => extractArticle({
    providerKey: 'animetrending',
    html: '<html><body><article><p>generic fallback must not run</p></article></body></html>',
    sourceUrl: 'https://anitrendz.net/news/missing/',
    finalUrl: 'https://anitrendz.net/news/missing/',
    locale: 'en-US',
  }), /ARTICLE_LAYOUT_UNSUPPORTED/u);
});

test('contentText and blocks truncate safely at the explicit character and block ceilings', () => {
  const paragraphs = Array.from({ length: 600 }, (_, index) => (
    `<p>Paragraph ${index} ${'x'.repeat(300)}</p>`
  )).join('');
  const result = extractArticle({
    providerKey: 'ann',
    html: `<main id="pagecontent"><h1>Large article</h1><div class="news-content">${paragraphs}</div></main>`,
    sourceUrl: 'https://www.animenewsnetwork.com/news/large/.1',
    finalUrl: 'https://www.animenewsnetwork.com/news/large/.1',
    locale: 'en-US',
  });
  assert.ok(result.contentText.length <= CONTRACT_LIMITS.articleContentText);
  assert.ok(result.blocks.length <= CONTRACT_LIMITS.articleBlocks);
  assert.ok(result.warnings.includes('CONTENT_TRUNCATED'));
  assert.ok(result.warnings.includes('AUTHOR_NOT_FOUND'));
  assert.ok(result.warnings.includes('PUBLISHED_AT_NOT_FOUND'));
});

test('selector definitions are explicit for every V1 provider', () => {
  assert.deepEqual(Object.keys(ARTICLE_EXTRACTION_DEFINITIONS).sort(), [
    'animecorner', 'animeherald', 'animetrending', 'ann', 'crunchyroll',
    'myanimelist', 'otakuusa',
  ]);
  for (const definition of Object.values(ARTICLE_EXTRACTION_DEFINITIONS)) {
    assert.ok(definition.articleRootSelectors.length > 0);
    assert.ok(definition.removeSelectors.includes('script'));
  }
  assert.deepEqual(
    ARTICLE_EXTRACTION_SELECTOR_REGISTRY.crunchyroll.map(({ selectorVersion }) => selectorVersion),
    ['crunchyroll-v2', 'crunchyroll-v1'],
  );
  assert.deepEqual(
    ARTICLE_EXTRACTION_SELECTOR_REGISTRY.ann.map(({ selectorVersion }) => selectorVersion),
    ['ann-v2', 'ann-v1'],
  );
  assert.deepEqual(
    ARTICLE_EXTRACTION_SELECTOR_REGISTRY.animetrending
      .map(({ selectorVersion }) => selectorVersion),
    ['animetrending-v2', 'animetrending-v1'],
  );
});
