'use strict';

const COMMON_REMOVE_SELECTORS = Object.freeze([
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'form', 'button',
  'input', 'textarea', 'select', 'object', 'embed', 'nav', 'footer', 'aside',
  '[aria-hidden="true"]', '.advertisement', '.ad', '.ads', '.newsletter',
  '.social-share', '.share-buttons', '.related', '.related-posts', '.comments',
]);

const ANN_V1_DEFINITION = Object.freeze({
  selectorVersion: 'ann-v1',
  inputType: 'html',
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
});

const ANN_V2_DEFINITION = Object.freeze({
  selectorVersion: 'ann-v2',
  inputType: 'html',
  articleRootSelectors: Object.freeze([
    '#content-zone .KonaBody .meat',
    '.maincontent.news.article .KonaBody .meat',
  ]),
  titleSelectors: Object.freeze(['#page_header', '#page-title h1']),
  authorSelectors: Object.freeze(['#page-title small a']),
  dateSelectors: Object.freeze(['#page-title time[datetime]']),
  removeSelectors: Object.freeze([
    ...COMMON_REMOVE_SELECTORS,
    '.encyc-info', '.share', '.social', '.news-related', '.forum-link', '.sidebar',
  ]),
});

const ANIMETRENDING_V1_DEFINITION = Object.freeze({
  selectorVersion: 'animetrending-v1',
  inputType: 'html',
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
});

const ANIMETRENDING_V2_DEFINITION = Object.freeze({
  selectorVersion: 'animetrending-v2',
  inputType: 'html',
  articleRootSelectors: Object.freeze([
    'article .td-post-content',
    '.td-post-content.tagdiv-type',
  ]),
  titleSelectors: Object.freeze(['article h1.entry-title', 'h1.tdb-title-text']),
  authorSelectors: Object.freeze([
    'article .tdb-author-name',
    'article .td-post-author-name a',
  ]),
  dateSelectors: Object.freeze([
    'article time[datetime]',
    'article .td-post-date time[datetime]',
  ]),
  removeSelectors: Object.freeze([
    ...COMMON_REMOVE_SELECTORS,
    '.at-share-btn-elements', '.td-post-sharing', '.recommended-posts', '.post-footer',
    '.td-a-rec', '.td-post-sharing-bottom', '.td-post-source-tags',
  ]),
});

const CRUNCHYROLL_V1_DEFINITION = Object.freeze({
  selectorVersion: 'crunchyroll-v1',
  inputType: 'html',
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
});

const CRUNCHYROLL_V2_DEFINITION = Object.freeze({
  selectorVersion: 'crunchyroll-v2',
  inputType: 'story-json',
  shellSelectors: Object.freeze([
    '#app',
    'script[src*="/news/build/_next/"]',
  ]),
  storyRootPath: 'story.content',
  bodyPath: 'story.content.body',
  richTextComponent: 'richtext',
  nestedRichTextContainer: 'columnswidget',
  supportedTemplates: Object.freeze({
    latest: 'generalnews',
    announcements: 'announcement',
    interviews: 'interviews',
  }),
  supportedNodeTypes: Object.freeze([
    'doc', 'paragraph', 'heading', 'bullet_list', 'ordered_list',
    'list_item', 'blockquote', 'text', 'hard_break',
  ]),
});

const MYANIMELIST_V1_DEFINITION = Object.freeze({
  selectorVersion: 'myanimelist-v1',
  inputType: 'html',
  articleRootSelectors: Object.freeze([
    '.news-container .content.clearfix',
  ]),
  titleSelectors: Object.freeze(['.news-container h1.title']),
  authorSelectors: Object.freeze(['.news-container .news-info-block .information a']),
  dateSelectors: Object.freeze([]),
  breakSeparatedText: true,
  removeSelectors: Object.freeze([
    ...COMMON_REMOVE_SELECTORS,
    '.news-related', '.comment-list', '.news-info-block',
  ]),
});

const OTAKUUSA_V1_DEFINITION = Object.freeze({
  selectorVersion: 'otakuusa-v1',
  inputType: 'html',
  articleRootSelectors: Object.freeze([
    '[id^="post-"].geekmag-post-content',
  ]),
  titleSelectors: Object.freeze(['.pagetitle']),
  authorSelectors: Object.freeze(['.geekmag-post-top-bar .geekmag-post-author']),
  dateSelectors: Object.freeze([]),
  useJsonLdMetadata: true,
  removeSelectors: Object.freeze([
    ...COMMON_REMOVE_SELECTORS,
    '#geegmag-related-container', '#geekmag-related-posts', '.geekmag-author-box',
    '.geekmag-post-top-bar', '.sharedaddy', '.code-block',
  ]),
});

const ANIMEHERALD_V1_DEFINITION = Object.freeze({
  selectorVersion: 'animeherald-v1',
  inputType: 'html',
  articleRootSelectors: Object.freeze([
    'article .entry-content',
  ]),
  titleSelectors: Object.freeze(['article h1.entry-title']),
  authorSelectors: Object.freeze(['article .entry-meta .author']),
  dateSelectors: Object.freeze(['article .entry-meta time[datetime]']),
  useJsonLdMetadata: true,
  removeSelectors: Object.freeze([
    ...COMMON_REMOVE_SELECTORS,
    '.sharedaddy', '.jp-relatedposts', '.block-support', '.block-share-this',
    '.block-post-meta', '.block-author-box',
  ]),
});

const ARTICLE_EXTRACTION_DEFINITIONS = Object.freeze({
  ann: ANN_V2_DEFINITION,
  animecorner: Object.freeze({
    selectorVersion: 'animecorner-v1',
    inputType: 'html',
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
  animetrending: ANIMETRENDING_V2_DEFINITION,
  crunchyroll: CRUNCHYROLL_V1_DEFINITION,
  myanimelist: MYANIMELIST_V1_DEFINITION,
  otakuusa: OTAKUUSA_V1_DEFINITION,
  animeherald: ANIMEHERALD_V1_DEFINITION,
});

const ARTICLE_EXTRACTION_SELECTOR_REGISTRY = Object.freeze({
  ann: Object.freeze([ANN_V2_DEFINITION, ANN_V1_DEFINITION]),
  animecorner: Object.freeze([ARTICLE_EXTRACTION_DEFINITIONS.animecorner]),
  animetrending: Object.freeze([ANIMETRENDING_V2_DEFINITION, ANIMETRENDING_V1_DEFINITION]),
  crunchyroll: Object.freeze([
    CRUNCHYROLL_V2_DEFINITION,
    CRUNCHYROLL_V1_DEFINITION,
  ]),
  myanimelist: Object.freeze([MYANIMELIST_V1_DEFINITION]),
  otakuusa: Object.freeze([OTAKUUSA_V1_DEFINITION]),
  animeherald: Object.freeze([ANIMEHERALD_V1_DEFINITION]),
});

module.exports = {
  ANIMEHERALD_V1_DEFINITION,
  ANIMETRENDING_V1_DEFINITION,
  ANIMETRENDING_V2_DEFINITION,
  ANN_V1_DEFINITION,
  ANN_V2_DEFINITION,
  ARTICLE_EXTRACTION_DEFINITIONS,
  ARTICLE_EXTRACTION_SELECTOR_REGISTRY,
  COMMON_REMOVE_SELECTORS,
  CRUNCHYROLL_V1_DEFINITION,
  CRUNCHYROLL_V2_DEFINITION,
  MYANIMELIST_V1_DEFINITION,
  OTAKUUSA_V1_DEFINITION,
};
