'use strict';

const cheerio = require('cheerio');

const {
  ARTICLE_EXTRACTION_SELECTOR_REGISTRY,
  CRUNCHYROLL_V2_DEFINITION,
} = require('./article-extraction-definitions');
const { CONTRACT_LIMITS } = require('./contracts');

const MINIMUM_USEFUL_CONTENT = 200;
const BLOCK_SELECTOR = 'h2, h3, h4, h5, h6, p, li, blockquote';
const CHALLENGE_PATTERN = /(?:enable javascript|access denied|attention required|checking your browser|captcha|subscribe to continue)/iu;
const CRUNCHYROLL_NEWS_API_HOST = 'cr-news-api-service.prd.crunchyrollsvc.com';
const KNOWN_IGNORED_CRUNCHYROLL_COMPONENTS = new Set([
  'article_banner_panel', 'cardpanel', 'image', 'twitterembed', 'youtubeembed',
]);

class ArticleExtractionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ArticleExtractionError';
    this.code = code;
  }
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim();
}

function canonicalLanguage(value) {
  if (typeof value !== 'string' || value.length > 35) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] || null;
  } catch {
    return null;
  }
}

function firstText($, selectors, maximumLength) {
  for (const selector of selectors) {
    const text = normalizeText($(selector).first().text());
    if (text) return text.slice(0, maximumLength).trimEnd();
  }
  return null;
}

function extractPublishedAt($, selectors) {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length === 0) continue;
    const value = element.attr('datetime') || normalizeText(element.text());
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function extractJsonLdMetadata($) {
  const candidates = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of values) {
        candidates.push(...(Array.isArray(value?.['@graph']) ? value['@graph'] : [value]));
      }
    } catch {
      // Invalid optional metadata does not weaken the provider-specific body boundary.
    }
  });

  const article = candidates.find((candidate) => {
    const types = Array.isArray(candidate?.['@type'])
      ? candidate['@type']
      : [candidate?.['@type']];
    return types.some((type) => ['Article', 'BlogPosting', 'NewsArticle'].includes(type));
  });
  if (!article || typeof article !== 'object') return {};

  const rawAuthor = Array.isArray(article.author) ? article.author[0] : article.author;
  const authorValue = typeof rawAuthor === 'string' ? rawAuthor : rawAuthor?.name;
  const titleValue = normalizeText(article.headline);
  const author = normalizeText(authorValue);
  return {
    title: titleValue
      ? titleValue.slice(0, CONTRACT_LIMITS.title).trimEnd()
      : null,
    author: author
      ? author.slice(0, CONTRACT_LIMITS.articleAuthor).trimEnd()
      : null,
    publishedAt: storyPublishedAt(article.datePublished),
    language: canonicalLanguage(article.inLanguage),
  };
}

function extractCanonicalUrl($, allowedHosts) {
  const value = $('link[rel="canonical"]').first().attr('href');
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || !allowedHosts.includes(url.hostname.toLowerCase())
    ) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function blockType(tagName) {
  if (/^h[2-6]$/u.test(tagName)) return 'heading';
  if (tagName === 'li') return 'list';
  if (tagName === 'blockquote') return 'quote';
  return 'paragraph';
}

function limitBlocks(rawBlocks, warnings) {
  const blocks = [];
  let contentLength = 0;
  for (const block of rawBlocks) {
    if (blocks.length === CONTRACT_LIMITS.articleBlocks) {
      if (!warnings.includes('CONTENT_TRUNCATED')) warnings.push('CONTENT_TRUNCATED');
      break;
    }
    const prefixLength = blocks.length === 0 ? 0 : 2;
    const available = CONTRACT_LIMITS.articleContentText - contentLength - prefixLength;
    if (available <= 0) {
      if (!warnings.includes('CONTENT_TRUNCATED')) warnings.push('CONTENT_TRUNCATED');
      break;
    }
    const rendered = block.type === 'list' ? `- ${block.text}` : block.text;
    if (rendered.length > available) {
      const textBudget = Math.max(0, available - (block.type === 'list' ? 2 : 0));
      const truncatedText = block.text.slice(0, textBudget).trimEnd();
      if (truncatedText) blocks.push({ ...block, text: truncatedText });
      if (!warnings.includes('CONTENT_TRUNCATED')) warnings.push('CONTENT_TRUNCATED');
      break;
    }
    blocks.push(block);
    contentLength += prefixLength + rendered.length;
  }

  const contentText = blocks.map((block) => (
    block.type === 'list' ? `- ${block.text}` : block.text
  )).join('\n\n');
  return { blocks, contentText };
}

function extractBlocks($, root, warnings) {
  const rawBlocks = [];
  root.find(BLOCK_SELECTOR).each((_index, element) => {
    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'p' && $(element).parents('li, blockquote').length > 0) return;
    if (tagName === 'li' && $(element).parents('li').length > 0) return;
    if (tagName === 'blockquote' && $(element).parents('blockquote').length > 0) return;
    const text = normalizeText($(element).text());
    if (!text) return;
    rawBlocks.push({ type: blockType(tagName), text });
  });
  return limitBlocks(rawBlocks, warnings);
}

function extractBreakSeparatedBlocks($, root, warnings) {
  const clone = root.clone();
  clone.find('br').replaceWith('\uE000');
  const rawBlocks = clone.text().split('\uE000')
    .map((text) => normalizeText(text))
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', text }));
  return limitBlocks(rawBlocks, warnings);
}

function crunchyrollArticlePath(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  }
  const match = url.pathname.match(
    /^\/([a-z]{2}(?:-[a-z]{2})?)\/news\/(latest|announcements|interviews)\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/([^/]+)$/iu,
  );
  if (!match) throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  const [, pathLocale, template, year, month, day, slug] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  }
  const apiLocale = canonicalLanguage(pathLocale);
  if (!apiLocale) throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  return {
    apiLocale,
    template: template.toLowerCase(),
    storySlug: `${template.toLowerCase()}/${year}/${month}/${day}/${slug}`,
  };
}

function createCrunchyrollStoryRequest(sourceUrl) {
  const path = crunchyrollArticlePath(sourceUrl);
  const url = new URL(`https://${CRUNCHYROLL_NEWS_API_HOST}/v1/${path.apiLocale}/stories`);
  url.searchParams.set('slug', path.storySlug);
  return { ...path, url: url.href };
}

function isCrunchyrollV2Shell(html) {
  if (typeof html !== 'string' || html.length === 0) return false;
  let $;
  try {
    $ = cheerio.load(html, { scriptingEnabled: false });
  } catch {
    return false;
  }
  return CRUNCHYROLL_V2_DEFINITION.shellSelectors.every((selector) => $(selector).length > 0)
    && $('article, main, p').length === 0;
}

function storyNodeText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hard_break') return '\n';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(storyNodeText).join('');
}

function extractStoryRichText(document, rawBlocks, warnings) {
  if (!document || document.type !== 'doc' || !Array.isArray(document.content)) {
    warnings.add('UNSUPPORTED_COMPONENT_SKIPPED');
    return;
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'doc') {
      if (Array.isArray(node.content)) node.content.forEach(visit);
      return;
    }
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') {
      const text = normalizeText(storyNodeText(node));
      if (text) {
        const type = node.type === 'heading'
          ? 'heading'
          : (node.type === 'blockquote' ? 'quote' : 'paragraph');
        rawBlocks.push({ type, text });
      }
      return;
    }
    if (node.type === 'bullet_list' || node.type === 'ordered_list') {
      for (const item of Array.isArray(node.content) ? node.content : []) {
        if (item?.type !== 'list_item') {
          warnings.add('UNSUPPORTED_COMPONENT_SKIPPED');
          continue;
        }
        const text = normalizeText(storyNodeText(item));
        if (text) rawBlocks.push({ type: 'list', text });
      }
      return;
    }
    if (!['text', 'hard_break', 'list_item', 'blok', 'horizontal_rule'].includes(node.type)) {
      warnings.add('UNSUPPORTED_COMPONENT_SKIPPED');
    }
  }
  visit(document);
}

function extractStoryComponents(components, rawBlocks, warnings, depth = 0) {
  if (!Array.isArray(components) || depth > 2) return;
  for (const component of components) {
    if (!component || typeof component !== 'object') {
      warnings.add('UNSUPPORTED_COMPONENT_SKIPPED');
      continue;
    }
    if (component.component === CRUNCHYROLL_V2_DEFINITION.richTextComponent) {
      const headline = normalizeText(component.headline);
      if (headline) rawBlocks.push({ type: 'heading', text: headline });
      extractStoryRichText(component.content, rawBlocks, warnings);
    } else if (component.component === CRUNCHYROLL_V2_DEFINITION.nestedRichTextContainer) {
      extractStoryComponents(component.items, rawBlocks, warnings, depth + 1);
    } else if (!KNOWN_IGNORED_CRUNCHYROLL_COMPONENTS.has(component.component)) {
      warnings.add('UNSUPPORTED_COMPONENT_SKIPPED');
    }
  }
}

function storyPublishedAt(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/u.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function storyAuthor(story, authorReferences) {
  if (!Array.isArray(authorReferences) || !Array.isArray(story?.rels)) return null;
  const references = new Set(authorReferences.filter((value) => typeof value === 'string'));
  for (const relation of story.rels) {
    if (!references.has(relation?.uuid) || relation?.content?.component !== 'author') continue;
    const value = normalizeText(relation.content.name || relation.content.title);
    if (value) return value.slice(0, CONTRACT_LIMITS.articleAuthor).trimEnd();
  }
  return null;
}

function extractCrunchyrollStory({ storyJson, sourceUrl, finalUrl, locale }) {
  let payload = storyJson;
  if (typeof storyJson === 'string') {
    try {
      payload = JSON.parse(storyJson);
    } catch {
      throw new ArticleExtractionError('ARTICLE_EXTRACTION_FAILED');
    }
  }
  const request = crunchyrollArticlePath(sourceUrl);
  const story = payload?.story;
  const content = story?.content;
  const expectedArticleType = CRUNCHYROLL_V2_DEFINITION.supportedTemplates[request.template];
  if (
    !story || typeof story !== 'object'
    || story.slug !== request.storySlug
    || !content || content.component !== 'article'
    || content.article_type !== expectedArticleType
    || !Array.isArray(content.body)
  ) {
    throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  }

  const warningSet = new Set();
  const rawBlocks = [];
  const lead = normalizeText(content.lead);
  if (lead) rawBlocks.push({ type: 'paragraph', text: lead });
  extractStoryComponents(content.body, rawBlocks, warningSet);
  const warnings = [...warningSet];
  const extracted = limitBlocks(rawBlocks, warnings);
  if (
    extracted.contentText.length < MINIMUM_USEFUL_CONTENT
    || CHALLENGE_PATTERN.test(extracted.contentText)
  ) {
    throw new ArticleExtractionError('ARTICLE_CONTENT_EMPTY');
  }

  const titleValue = normalizeText(content.headline || content.seo?.title);
  const title = titleValue ? titleValue.slice(0, CONTRACT_LIMITS.title).trimEnd() : null;
  const author = storyAuthor(payload, content.authors);
  const publishedAt = storyPublishedAt(content.article_date);
  if (!author) warnings.push('AUTHOR_NOT_FOUND');
  if (!publishedAt) warnings.push('PUBLISHED_AT_NOT_FOUND');

  return {
    sourceUrl,
    finalUrl,
    canonicalUrl: sourceUrl,
    title,
    author,
    publishedAt,
    language: canonicalLanguage(locale) || request.apiLocale,
    selectorVersion: CRUNCHYROLL_V2_DEFINITION.selectorVersion,
    contentText: extracted.contentText,
    blocks: extracted.blocks,
    warnings: [...new Set(warnings)].slice(0, CONTRACT_LIMITS.articleWarnings),
  };
}

function extractArticle({ providerKey, html, finalUrl, sourceUrl, locale }) {
  const definitions = ARTICLE_EXTRACTION_SELECTOR_REGISTRY[providerKey]
    ?.filter((definition) => definition.inputType === 'html');
  if (!definitions || definitions.length === 0) {
    throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  }
  if (typeof html !== 'string' || html.length === 0) {
    throw new ArticleExtractionError('ARTICLE_CONTENT_EMPTY');
  }

  let $;
  try {
    $ = cheerio.load(html, { scriptingEnabled: false });
  } catch {
    throw new ArticleExtractionError('ARTICLE_EXTRACTION_FAILED');
  }

  for (const definition of definitions) {
    let root = null;
    for (const selector of definition.articleRootSelectors) {
      const candidate = $(selector).first();
      if (candidate.length > 0) {
        root = candidate;
        break;
      }
    }
    if (!root) continue;

    root.find(definition.removeSelectors.join(', ')).remove();
    const warnings = [];
    const extracted = definition.breakSeparatedText
      ? extractBreakSeparatedBlocks($, root, warnings)
      : extractBlocks($, root, warnings);
    if (
      extracted.contentText.length < MINIMUM_USEFUL_CONTENT
      || CHALLENGE_PATTERN.test(extracted.contentText)
    ) {
      throw new ArticleExtractionError('ARTICLE_CONTENT_EMPTY');
    }

    const jsonLd = definition.useJsonLdMetadata ? extractJsonLdMetadata($) : {};
    const title = firstText($, definition.titleSelectors, CONTRACT_LIMITS.title)
      || jsonLd.title
      || null;
    const author = firstText($, definition.authorSelectors, CONTRACT_LIMITS.articleAuthor)
      || jsonLd.author
      || null;
    const publishedAt = extractPublishedAt($, definition.dateSelectors)
      || jsonLd.publishedAt
      || null;
    if (!author) warnings.push('AUTHOR_NOT_FOUND');
    if (!publishedAt) warnings.push('PUBLISHED_AT_NOT_FOUND');

    const allowedHosts = require('./source-registry').V1_SOURCE_METADATA[providerKey]
      .allowedSourceHosts;
    const canonicalUrl = extractCanonicalUrl($, allowedHosts);
    const documentLanguage = canonicalLanguage($('html').attr('lang'));
    const language = documentLanguage || jsonLd.language || canonicalLanguage(locale);

    return {
      sourceUrl,
      finalUrl,
      canonicalUrl,
      title,
      author,
      publishedAt,
      language,
      selectorVersion: definition.selectorVersion,
      contentText: extracted.contentText,
      blocks: extracted.blocks,
      warnings: warnings.slice(0, CONTRACT_LIMITS.articleWarnings),
    };
  }

  throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
}

module.exports = {
  CRUNCHYROLL_NEWS_API_HOST,
  MINIMUM_USEFUL_CONTENT,
  ArticleExtractionError,
  createCrunchyrollStoryRequest,
  extractArticle,
  extractCrunchyrollStory,
  isCrunchyrollV2Shell,
  normalizeText,
};
