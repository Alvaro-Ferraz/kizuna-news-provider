'use strict';

const he = require('he');

const {
  CONTRACT_LIMITS,
  DISCOVERY_METHODS,
  discoveryRunResponseSchema,
  sourceArticleSchema,
  sourceOutcomeSchema,
} = require('./contracts');

const INVALID_LANGUAGE_TAG = Symbol('invalid-language-tag');

function addWarning(warnings, warning) {
  if (!warnings.includes(warning) && warnings.length < 10) warnings.push(warning);
}

function toPlainText(value) {
  if (typeof value !== 'string') return null;
  const decodedValue = he.decode(he.decode(value));
  const withoutActiveContent = decodedValue
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ');
  return he.decode(withoutActiveContent)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeOptionalText(value, maximumLength) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = toPlainText(value);
  if (normalized === null || normalized.length === 0) return null;
  if (normalized.length > maximumLength) throw new Error('FIELD_TOO_LONG');
  return normalized;
}

function normalizeInstant(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeLanguageTag(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 35) return INVALID_LANGUAGE_TAG;
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return INVALID_LANGUAGE_TAG;
  }
}

function normalizeUrl(value, { allowedHosts } = {}) {
  if (typeof value !== 'string' || value.length > CONTRACT_LIMITS.url) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) return null;
    if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > CONTRACT_LIMITS.tags) {
    throw new Error('INVALID_TAGS');
  }

  const tags = [];
  for (const rawTag of value) {
    const tag = toPlainText(rawTag);
    if (!tag || tag.length > CONTRACT_LIMITS.tag) throw new Error('INVALID_TAGS');
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function normalizeArticle(rawArticle, source, discoveredAt) {
  if (!rawArticle || typeof rawArticle !== 'object' || Array.isArray(rawArticle)) return null;

  try {
    const title = toPlainText(rawArticle.title);
    if (!title || title.length > CONTRACT_LIMITS.title) return null;

    const sourceUrl = normalizeUrl(rawArticle.sourceUrl || rawArticle.link, {
      allowedHosts: source.allowedSourceHosts,
    });
    if (!sourceUrl) return null;

    const imageValue = rawArticle.imageUrl || rawArticle.image;
    const imageUrl = imageValue ? normalizeUrl(imageValue) : null;
    if (imageValue && !imageUrl) return null;

    const language = normalizeLanguageTag(rawArticle.language);
    const locale = normalizeLanguageTag(rawArticle.locale);
    if (language === INVALID_LANGUAGE_TAG || locale === INVALID_LANGUAGE_TAG) return null;

    const requestedDiscoveryMethod = rawArticle.discoveryMethod || source.discoveryMethod;
    const discoveryMethod = DISCOVERY_METHODS.includes(requestedDiscoveryMethod)
      ? requestedDiscoveryMethod
      : null;
    if (!discoveryMethod) return null;

    const article = {
      schemaVersion: 1,
      providerKey: source.providerKey,
      sourceDisplayName: source.sourceDisplayName,
      providerArticleId: normalizeOptionalText(
        rawArticle.providerArticleId,
        CONTRACT_LIMITS.providerArticleId,
      ),
      providerSlug: normalizeOptionalText(
        rawArticle.providerSlug || rawArticle.slug,
        CONTRACT_LIMITS.providerSlug,
      ),
      title,
      excerpt: normalizeOptionalText(rawArticle.excerpt, CONTRACT_LIMITS.excerpt),
      publishedAt: normalizeInstant(rawArticle.publishedAt || rawArticle.date),
      sourceUrl,
      imageUrl,
      tags: normalizeTags(rawArticle.tags),
      language,
      locale,
      discoveryMethod,
      discoveredAt,
    };

    const parsed = sourceArticleSchema.safeParse(article);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function articleIdentity(article) {
  if (article.providerArticleId) {
    return `${article.providerKey}:id:${article.providerArticleId}`;
  }
  return `${article.providerKey}:url:${article.sourceUrl}`;
}

function normalizeSourceArticles(rawArticles, source, discoveredAt) {
  const warnings = [];
  const cappedArticles = rawArticles.slice(0, CONTRACT_LIMITS.articlesPerSource);
  if (rawArticles.length > cappedArticles.length) addWarning(warnings, 'ARTICLE_LIMIT_EXCEEDED');

  const articles = [];
  const identities = new Set();
  for (const rawArticle of cappedArticles) {
    const article = normalizeArticle(rawArticle, source, discoveredAt);
    if (!article) {
      addWarning(warnings, 'INVALID_ARTICLE_FILTERED');
      continue;
    }

    const identity = articleIdentity(article);
    if (identities.has(identity)) {
      addWarning(warnings, 'DUPLICATE_ARTICLE_FILTERED');
      continue;
    }

    identities.add(identity);
    articles.push(article);
  }

  if (rawArticles.length === 0 && source.emptyResultAmbiguous) {
    addWarning(warnings, 'LEGACY_EMPTY_RESULT_AMBIGUOUS');
  }

  return { articles, warnings };
}

function applyResponseSizeLimit(response) {
  const removedByProvider = new Set();
  while (
    response.articles.length > 0
    && Buffer.byteLength(JSON.stringify(response), 'utf8') > CONTRACT_LIMITS.discoveryResponseBytes
  ) {
    const removed = response.articles.pop();
    removedByProvider.add(removed.providerKey);
  }

  for (const providerKey of removedByProvider) {
    const outcome = response.sources.find((source) => source.providerKey === providerKey);
    outcome.articleCount = response.articles.filter(
      (article) => article.providerKey === providerKey,
    ).length;
    if (outcome.outcome === 'healthy') outcome.outcome = 'degraded';
    addWarning(outcome.warnings, 'RESPONSE_SIZE_LIMIT');
  }

  if (Buffer.byteLength(JSON.stringify(response), 'utf8') > CONTRACT_LIMITS.discoveryResponseBytes) {
    throw new Error('DISCOVERY_RESPONSE_TOO_LARGE');
  }
}

function createDiscoveryService({
  config,
  sourceRegistry,
  healthStore,
  logger,
  now = () => new Date(),
  monotonicNow = () => Date.now(),
}) {
  const enabledSources = config.enabledSources.map((providerKey) => {
    const source = sourceRegistry[providerKey];
    if (!source || typeof source.fetch !== 'function') {
      throw new Error(`Missing source implementation for ${providerKey}`);
    }
    return source;
  });

  async function runSource(source, discoveredAt) {
    const startedAt = monotonicNow();
    try {
      const rawArticles = await source.fetch();
      const durationMs = Math.max(0, Math.round(monotonicNow() - startedAt));
      if (!Array.isArray(rawArticles)) {
        return {
          articles: [],
          outcome: sourceOutcomeSchema.parse({
            providerKey: source.providerKey,
            sourceDisplayName: source.sourceDisplayName,
            outcome: 'failed',
            articleCount: 0,
            durationMs,
            warnings: [],
            errorCode: 'INVALID_SOURCE_RESULT',
          }),
        };
      }

      const normalized = normalizeSourceArticles(rawArticles, source, discoveredAt);
      return {
        articles: normalized.articles,
        outcome: sourceOutcomeSchema.parse({
          providerKey: source.providerKey,
          sourceDisplayName: source.sourceDisplayName,
          outcome: normalized.warnings.length > 0 ? 'degraded' : 'healthy',
          articleCount: normalized.articles.length,
          durationMs,
          warnings: normalized.warnings,
          errorCode: null,
        }),
      };
    } catch {
      return {
        articles: [],
        outcome: sourceOutcomeSchema.parse({
          providerKey: source.providerKey,
          sourceDisplayName: source.sourceDisplayName,
          outcome: 'failed',
          articleCount: 0,
          durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
          warnings: [],
          errorCode: 'SOURCE_FETCH_FAILED',
        }),
      };
    }
  }

  return {
    async run() {
      const fetchedAt = now().toISOString();
      const results = await Promise.all(
        enabledSources.map((source) => runSource(source, fetchedAt)),
      );

      const response = {
        schemaVersion: 1,
        serviceVersion: config.serviceVersion,
        fetchedAt,
        articles: results.flatMap((result) => result.articles),
        sources: results.map((result) => result.outcome),
      };

      applyResponseSizeLimit(response);

      for (const outcome of response.sources) {
        healthStore.record(outcome, fetchedAt);
        logger.info('provider_discovery_completed', {
          providerKey: outcome.providerKey,
          outcome: outcome.outcome,
          articleCount: outcome.articleCount,
          durationMs: outcome.durationMs,
          errorCode: outcome.errorCode,
        });
      }

      return {
        allSourcesFailed: response.sources.every((source) => source.outcome === 'failed'),
        response: discoveryRunResponseSchema.parse(response),
      };
    },
  };
}

module.exports = {
  articleIdentity,
  createDiscoveryService,
  normalizeArticle,
  normalizeSourceArticles,
};
