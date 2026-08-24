'use strict';

const RSSParser = require('rss-parser');

const { getDefaultProviderHttpClient } = require('./provider-http-client');
const { ProviderError, asProviderError } = require('./provider-error');
const { toPlainText, truncateText } = require('./text-normalization');

const ITEM_LIMIT = 100;
const EXCERPT_LIMIT = 600;
const TITLE_LIMIT = 500;
const GUID_LIMIT = 500;
const URL_LIMIT = 2048;
const TAG_LIMIT = 20;
const TAG_LENGTH_LIMIT = 100;
const DEFAULT_FRESHNESS_MS = 10 * 60 * 1000;
const MAXIMUM_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60 * 1000;

const rssParser = new RSSParser({
  customFields: {
    item: [
      ['description', 'description'],
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
  },
});

function addWarning(warnings, code) {
  if (!warnings.includes(code) && warnings.length < 10) warnings.push(code);
}

function normalizeHttpsUrl(value, allowedHosts) {
  if (typeof value !== 'string' || value.length > URL_LIMIT) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function attributesOf(value) {
  if (!value || typeof value !== 'object') return {};
  return value.$ || value.attrs || value;
}

function imageFromItem(item, allowEncodedImage) {
  const candidates = [];
  for (const value of [item.mediaThumbnail, item.mediaContent].flat().filter(Boolean)) {
    candidates.push(attributesOf(value).url);
  }
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image/')) {
    candidates.push(item.enclosure.url);
  }
  if (allowEncodedImage) {
    for (const field of [item.contentEncoded, item.description]) {
      if (typeof field !== 'string') continue;
      const match = field.match(/<img[^>]+src=["']([^"']+)["']/iu);
      if (match) candidates.push(match[1]);
    }
  }
  for (const candidate of candidates) {
    const normalized = normalizeHttpsUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeTags(categories, warnings) {
  const tags = [];
  const identities = new Set();
  for (const rawCategory of Array.isArray(categories) ? categories : []) {
    const tag = toPlainText(typeof rawCategory === 'string' ? rawCategory : rawCategory?._);
    if (!tag) continue;
    if (tag.length > TAG_LENGTH_LIMIT) {
      addWarning(warnings, 'INVALID_TAG_DROPPED');
      continue;
    }
    const identity = tag.toLocaleLowerCase('en-US');
    if (identities.has(identity)) continue;
    if (tags.length === TAG_LIMIT) {
      addWarning(warnings, 'TAG_LIMIT_REACHED');
      break;
    }
    identities.add(identity);
    tags.push(tag);
  }
  return tags;
}

function assertSafeXml(xml) {
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new ProviderError('PROVIDER_INVALID_XML');
  }
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new ProviderError('PROVIDER_UNSAFE_XML');
  }
  const withoutDeclaration = xml.replace(/^\s*<\?xml[^>]*\?>/iu, '').trimStart();
  const withoutLeadingComments = withoutDeclaration
    .replace(/^(?:<!--[\s\S]*?-->\s*)*/u, '');
  if (!/^<rss(?:\s|>)/iu.test(withoutLeadingComments)) {
    throw new ProviderError('PROVIDER_INVALID_XML_ROOT');
  }
}

async function parseRss(xml, definition, feedVariant = definition.feeds[0]) {
  assertSafeXml(xml);
  let feed;
  try {
    feed = await rssParser.parseString(xml);
  } catch (error) {
    throw new ProviderError('PROVIDER_INVALID_XML', { cause: error });
  }
  if (!feed || !Array.isArray(feed.items)) throw new ProviderError('PROVIDER_INVALID_XML_ROOT');

  const warnings = [];
  const rawItems = feed.items.slice(0, ITEM_LIMIT);
  if (feed.items.length > ITEM_LIMIT) addWarning(warnings, 'ITEM_LIMIT_REACHED');
  const articles = [];

  for (const item of rawItems) {
    const title = toPlainText(item.title);
    const sourceUrl = normalizeHttpsUrl(item.link, definition.articleHosts);
    if (!title || title.length > TITLE_LIMIT || !sourceUrl) {
      addWarning(warnings, 'INVALID_ITEM_DROPPED');
      continue;
    }

    const guid = toPlainText(item.guid);
    const providerArticleId = guid && guid.length <= GUID_LIMIT ? guid : sourceUrl;
    const description = toPlainText(item.description || item.contentSnippet || '');
    const excerpt = description ? truncateText(description, EXCERPT_LIMIT) : null;
    if (description && description.length > EXCERPT_LIMIT) addWarning(warnings, 'EXCERPT_TRUNCATED');

    articles.push({
      providerArticleId,
      providerSlug: null,
      title,
      excerpt,
      publishedAt: item.pubDate || item.isoDate || null,
      sourceUrl,
      imageUrl: definition.imageFromFeed
        ? imageFromItem(item, definition.imageFromEncodedContent)
        : null,
      tags: normalizeTags(item.categories, warnings),
      language: feedVariant.language,
      locale: feedVariant.locale,
      discoveryMethod: 'DIRECT_RSS',
    });
  }

  return { articles, warnings };
}

function parseFreshness(headers, nowMs, defaultFreshnessMs) {
  const cacheControl = headers['cache-control'] || '';
  if (/(?:^|,)\s*(?:no-store|no-cache)(?:,|$)/iu.test(cacheControl)) return nowMs;
  const maxAge = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/iu);
  const advertised = maxAge ? Number(maxAge[1]) * 1000 : defaultFreshnessMs;
  const freshnessMs = Number.isFinite(advertised)
    ? Math.min(MAXIMUM_FRESHNESS_MS, Math.max(0, advertised))
    : defaultFreshnessMs;
  return nowMs + freshnessMs;
}

function conditionalHeaders(cacheEntry) {
  const headers = {};
  if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag;
  if (cacheEntry?.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified;
  return headers;
}

function result({ articles = [], outcome, warnings = [], errorCode = null, attemptCount = 0,
  cacheStatus = 'miss', freshUntil = null }) {
  return { articles, outcome, warnings, errorCode, attemptCount, cacheStatus, freshUntil };
}

function createRssProvider(definition, dependencies = {}) {
  const httpClient = dependencies.httpClient || getDefaultProviderHttpClient();
  const now = dependencies.now || Date.now;
  const cacheByUrl = new Map();
  const defaultFreshnessMs = definition.defaultFreshnessMs ?? DEFAULT_FRESHNESS_MS;
  let inflight = null;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  async function fetchVariant(feedVariant, deadlineAt) {
    const cached = cacheByUrl.get(feedVariant.url);
    const currentTime = now();
    if (cached && cached.freshUntil > currentTime) {
      return result({
        articles: cached.articles,
        outcome: cached.warnings.length > 0 ? 'degraded' : 'healthy',
        warnings: cached.warnings,
        cacheStatus: 'fresh',
        freshUntil: new Date(cached.freshUntil).toISOString(),
      });
    }

    const response = await httpClient.getRss({
      url: feedVariant.url,
      allowedHosts: definition.feedHosts,
      conditionalHeaders: conditionalHeaders(cached),
      deadlineAt,
    });

    if (response.status === 304) {
      if (!cached) {
        const error = new ProviderError('PROVIDER_NOT_MODIFIED_WITHOUT_CACHE');
        error.attemptCount = response.attemptCount;
        throw error;
      }
      cached.freshUntil = parseFreshness(response.headers, now(), defaultFreshnessMs);
      return result({
        articles: cached.articles,
        outcome: cached.warnings.length > 0 ? 'degraded' : 'healthy',
        warnings: cached.warnings,
        attemptCount: response.attemptCount,
        cacheStatus: 'not_modified',
        freshUntil: new Date(cached.freshUntil).toISOString(),
      });
    }

    let parsed;
    try {
      parsed = await parseRss(response.body, definition, feedVariant);
    } catch (error) {
      const safeError = asProviderError(error, 'PROVIDER_INVALID_XML');
      safeError.attemptCount = response.attemptCount;
      throw safeError;
    }
    const entry = {
      articles: parsed.articles,
      warnings: parsed.warnings,
      etag: response.headers.etag || null,
      lastModified: response.headers['last-modified'] || null,
      freshUntil: parseFreshness(response.headers, now(), defaultFreshnessMs),
    };
    cacheByUrl.set(feedVariant.url, entry);
    return result({
      articles: entry.articles,
      outcome: entry.warnings.length > 0 ? 'degraded' : 'healthy',
      warnings: entry.warnings,
      attemptCount: response.attemptCount,
      cacheStatus: 'miss',
      freshUntil: new Date(entry.freshUntil).toISOString(),
    });
  }

  async function execute() {
    const currentTime = now();
    const primary = definition.feeds[0];
    const primaryCache = cacheByUrl.get(primary.url);
    if (circuitOpenUntil > currentTime) {
      if (primaryCache) {
        return result({
          articles: primaryCache.articles,
          outcome: 'degraded',
          warnings: ['CIRCUIT_OPEN', 'STALE_CACHE_USED'],
          cacheStatus: 'stale',
          freshUntil: new Date(primaryCache.freshUntil).toISOString(),
        });
      }
      return result({ outcome: 'failed', errorCode: 'PROVIDER_CIRCUIT_OPEN' });
    }

    const deadlineAt = currentTime + (definition.operationDeadlineMs || 15_000);
    let primaryError;
    try {
      const primaryResult = await fetchVariant(primary, deadlineAt);
      consecutiveFailures = 0;
      circuitOpenUntil = 0;
      return primaryResult;
    } catch (error) {
      primaryError = asProviderError(error, 'PROVIDER_FETCH_FAILED');
    }

    const fallback = definition.feeds[1];
    if (fallback && deadlineAt > now()) {
      try {
        const fallbackResult = await fetchVariant(fallback, deadlineAt);
        consecutiveFailures = 0;
        circuitOpenUntil = 0;
        return {
          ...fallbackResult,
          outcome: 'degraded',
          warnings: [...new Set([
            'FALLBACK_USED',
            'LOCALE_FALLBACK_USED',
            ...fallbackResult.warnings,
          ])].slice(0, 10),
          attemptCount: primaryError.attemptCount + fallbackResult.attemptCount,
        };
      } catch (fallbackError) {
        const safeFallbackError = asProviderError(fallbackError, 'PROVIDER_FETCH_FAILED');
        safeFallbackError.attemptCount += primaryError.attemptCount;
        primaryError = safeFallbackError;
      }
    }

    consecutiveFailures += 1;
    if (consecutiveFailures >= CIRCUIT_THRESHOLD) circuitOpenUntil = now() + CIRCUIT_COOLDOWN_MS;
    if (primaryCache) {
      return result({
        articles: primaryCache.articles,
        outcome: 'degraded',
        warnings: ['STALE_CACHE_USED'],
        attemptCount: primaryError.attemptCount,
        cacheStatus: 'stale',
        freshUntil: new Date(primaryCache.freshUntil).toISOString(),
      });
    }
    return result({
      outcome: 'failed',
      errorCode: primaryError.code,
      attemptCount: primaryError.attemptCount,
    });
  }

  return {
    fetch() {
      if (inflight) return inflight;
      inflight = execute().finally(() => { inflight = null; });
      return inflight;
    },
    inspectCache() {
      return new Map(cacheByUrl);
    },
  };
}

module.exports = {
  EXCERPT_LIMIT,
  ITEM_LIMIT,
  assertSafeXml,
  createRssProvider,
  normalizeHttpsUrl,
  parseFreshness,
  parseRss,
};
