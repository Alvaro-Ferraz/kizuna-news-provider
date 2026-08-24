'use strict';

const cheerio = require('cheerio');

const { ARTICLE_EXTRACTION_DEFINITIONS } = require('./article-extraction-definitions');
const { CONTRACT_LIMITS } = require('./contracts');

const MINIMUM_USEFUL_CONTENT = 200;
const BLOCK_SELECTOR = 'h2, h3, h4, h5, h6, p, li, blockquote';
const CHALLENGE_PATTERN = /(?:enable javascript|access denied|attention required|checking your browser|captcha|subscribe to continue)/iu;

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

function extractArticle({ providerKey, html, finalUrl, sourceUrl, locale }) {
  const definition = ARTICLE_EXTRACTION_DEFINITIONS[providerKey];
  if (!definition) throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');
  if (typeof html !== 'string' || html.length === 0) {
    throw new ArticleExtractionError('ARTICLE_CONTENT_EMPTY');
  }

  let $;
  try {
    $ = cheerio.load(html, { scriptingEnabled: false });
  } catch {
    throw new ArticleExtractionError('ARTICLE_EXTRACTION_FAILED');
  }

  let root = null;
  for (const selector of definition.articleRootSelectors) {
    const candidate = $(selector).first();
    if (candidate.length > 0) {
      root = candidate;
      break;
    }
  }
  if (!root) throw new ArticleExtractionError('ARTICLE_LAYOUT_UNSUPPORTED');

  root.find(definition.removeSelectors.join(', ')).remove();
  const warnings = [];
  const extracted = extractBlocks($, root, warnings);
  if (
    extracted.contentText.length < MINIMUM_USEFUL_CONTENT
    || CHALLENGE_PATTERN.test(extracted.contentText)
  ) {
    throw new ArticleExtractionError('ARTICLE_CONTENT_EMPTY');
  }

  const title = firstText($, definition.titleSelectors, CONTRACT_LIMITS.title);
  const author = firstText($, definition.authorSelectors, CONTRACT_LIMITS.articleAuthor);
  const publishedAt = extractPublishedAt($, definition.dateSelectors);
  if (!author) warnings.push('AUTHOR_NOT_FOUND');
  if (!publishedAt) warnings.push('PUBLISHED_AT_NOT_FOUND');

  const allowedHosts = require('./source-registry').V1_SOURCE_METADATA[providerKey]
    .allowedSourceHosts;
  const canonicalUrl = extractCanonicalUrl($, allowedHosts);
  const documentLanguage = canonicalLanguage($('html').attr('lang'));
  const language = documentLanguage || canonicalLanguage(locale);

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

module.exports = {
  MINIMUM_USEFUL_CONTENT,
  ArticleExtractionError,
  extractArticle,
  normalizeText,
};
