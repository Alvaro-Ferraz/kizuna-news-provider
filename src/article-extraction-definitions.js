'use strict';

const COMMON_REMOVE_SELECTORS = Object.freeze([
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'form', 'button',
  'input', 'textarea', 'select', 'object', 'embed', 'nav', 'footer', 'aside',
  '[aria-hidden="true"]', '.advertisement', '.ad', '.ads', '.newsletter',
  '.social-share', '.share-buttons', '.related', '.related-posts', '.comments',
]);

const ARTICLE_EXTRACTION_DEFINITIONS = Object.freeze({
  ann: Object.freeze({
    selectorVersion: 'ann-v1',
    articleRootSelectors: Object.freeze([
      '#pagecontent .news-content',
      '#pagecontent .article-content',
      '#pagecontent .meat',
    ]),
    titleSelectors: Object.freeze(['#pagecontent h1', 'h1.news-title']),
    authorSelectors: Object.freeze(['#pagecontent .byline [rel="author"]', '#pagecontent .byline']),
    dateSelectors: Object.freeze(['#pagecontent time[datetime]', '#pagecontent .posted-on']),
    removeSelectors: Object.freeze([
      ...COMMON_REMOVE_SELECTORS,
      '.encyc-info', '.share', '.social', '.news-related', '.forum-link', '.sidebar',
    ]),
  }),
  animecorner: Object.freeze({
    selectorVersion: 'animecorner-v1',
    articleRootSelectors: Object.freeze([
      'article .entry-content',
      '.single-post-content .entry-content',
    ]),
    titleSelectors: Object.freeze(['article h1.entry-title', '.post-title h1']),
    authorSelectors: Object.freeze(['article .author-name', 'article [rel="author"]']),
    dateSelectors: Object.freeze(['article time[datetime]', 'article .entry-date']),
    removeSelectors: Object.freeze([
      ...COMMON_REMOVE_SELECTORS,
      '.sharedaddy', '.jp-relatedposts', '.code-block', '.post-tags', '.author-box',
    ]),
  }),
  animetrending: Object.freeze({
    selectorVersion: 'animetrending-v1',
    articleRootSelectors: Object.freeze([
      'article .entry-content',
      'article .post-content',
      '.single-post .article-content',
    ]),
    titleSelectors: Object.freeze(['article h1.entry-title', '.single-post h1.post-title']),
    authorSelectors: Object.freeze(['article .author-name', 'article [rel="author"]']),
    dateSelectors: Object.freeze(['article time[datetime]', 'article .published-date']),
    removeSelectors: Object.freeze([
      ...COMMON_REMOVE_SELECTORS,
      '.at-share-btn-elements', '.td-post-sharing', '.recommended-posts', '.post-footer',
    ]),
  }),
  crunchyroll: Object.freeze({
    selectorVersion: 'crunchyroll-v1',
    articleRootSelectors: Object.freeze([
      '[data-t="news-article-body"]',
      'article .article-body',
      'article .rich-text',
    ]),
    titleSelectors: Object.freeze(['article h1', '[data-t="news-article-title"]']),
    authorSelectors: Object.freeze(['article [data-t="news-article-author"]', 'article .byline']),
    dateSelectors: Object.freeze(['article time[datetime]', '[data-t="news-article-date"]']),
    removeSelectors: Object.freeze([
      ...COMMON_REMOVE_SELECTORS,
      '[data-t="related-content"]', '[data-t="share-buttons"]', '.promo-card', '.cta',
    ]),
  }),
});

module.exports = { ARTICLE_EXTRACTION_DEFINITIONS, COMMON_REMOVE_SELECTORS };
