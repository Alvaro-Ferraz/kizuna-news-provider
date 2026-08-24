'use strict';

const {
  CONTRACT_LIMITS,
  DISCOVERY_METHODS,
  discoveryRunResponseSchema,
  sourceArticleSchema,
  sourceOutcomeSchema,
} = require('./contracts');
const { createArticleRefSigner } = require('./article-ref');
const { toPlainText } = require('./text-normalization');

const INVALID_LANGUAGE_TAG = Symbol('invalid-language-tag');

function addWarning(warnings, warning) {
  if (!warnings.includes(warning) && warnings.length < 10) warnings.push(warning);
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
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('INVALID_TAGS');

  const tags = [];
  const identities = new Set();
  for (const rawTag of value.slice(0, CONTRACT_LIMITS.tags)) {
    const tag = toPlainText(rawTag);
    if (!tag || tag.length > CONTRACT_LIMITS.tag) throw new Error('INVALID_TAGS');
    const identity = tag.toLocaleLowerCase('en-US');
    if (!identities.has(identity)) {
      identities.add(identity);
      tags.push(tag);
    }
  }
  return tags;
}

function normalizeArticle(rawArticle, source, discoveredAt, articleRefSigner) {
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

    const language = normalizeLanguageTag(rawArticle.language);
    const locale = normalizeLanguageTag(rawArticle.locale);
    if (language === INVALID_LANGUAGE_TAG || locale === INVALID_LANGUAGE_TAG) return null;

    const requestedDiscoveryMethod = rawArticle.discoveryMethod || source.discoveryMethod;
    const discoveryMethod = DISCOVERY_METHODS.includes(requestedDiscoveryMethod)
      ? requestedDiscoveryMethod
      : null;
    if (!discoveryMethod) return null;

    const article = {
      schemaVersion: 2,
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
      articleRef: articleRefSigner.sign({
        providerKey: source.providerKey,
        providerArticleId: normalizeOptionalText(
          rawArticle.providerArticleId,
          CONTRACT_LIMITS.providerArticleId,
        ),
        canonicalSourceUrl: sourceUrl,
        locale,
      }),
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

function normalizeSourceArticles(rawArticles, source, discoveredAt, articleRefSigner) {
  const warnings = [];
  const cappedArticles = rawArticles.slice(0, CONTRACT_LIMITS.articlesPerSource);
  if (rawArticles.length > cappedArticles.length) addWarning(warnings, 'ARTICLE_LIMIT_EXCEEDED');

  const articles = [];
  const identities = new Map();
  for (const rawArticle of cappedArticles) {
    const article = normalizeArticle(rawArticle, source, discoveredAt, articleRefSigner);
    if (!article) {
      addWarning(warnings, 'INVALID_ITEM_DROPPED');
      continue;
    }

    const rawDate = rawArticle.publishedAt || rawArticle.date;
    if (rawDate && article.publishedAt === null) addWarning(warnings, 'INVALID_DATE_DROPPED');

    const identity = articleIdentity(article);
    if (identities.has(identity)) {
      addWarning(warnings, 'DUPLICATE_ITEM_DROPPED');
      const existingIndex = identities.get(identity);
      const existing = articles[existingIndex];
      const completeness = (value) => [value.excerpt, value.publishedAt, value.imageUrl]
        .filter(Boolean).length + value.tags.length;
      if (completeness(article) > completeness(existing)) articles[existingIndex] = article;
      continue;
    }

    identities.set(identity, articles.length);
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
  const articleRefSigner = createArticleRefSigner({
    secret: config.articleRefSecret,
    now: () => now().getTime(),
  });
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
      const fetched = await source.fetch();
      const durationMs = Math.max(0, Math.round(monotonicNow() - startedAt));
      const structured = Array.isArray(fetched) ? null : fetched;
      const rawArticles = structured?.articles ?? fetched;
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
          metadata: {},
        };
      }

      const metadata = {
        attemptCount: structured?.attemptCount || 0,
        cacheStatus: structured?.cacheStatus || 'none',
        freshUntil: structured?.freshUntil || null,
      };
      if (structured?.outcome === 'failed') {
        return {
          articles: [],
          outcome: sourceOutcomeSchema.parse({
            providerKey: source.providerKey,
            sourceDisplayName: source.sourceDisplayName,
            outcome: 'failed',
            articleCount: 0,
            durationMs,
            warnings: structured.warnings || [],
            errorCode: structured.errorCode || 'SOURCE_FETCH_FAILED',
          }),
          metadata,
        };
      }

      const normalized = normalizeSourceArticles(
        rawArticles,
        source,
        discoveredAt,
        articleRefSigner,
      );
      const warnings = [];
      for (const warning of [...(structured?.warnings || []), ...normalized.warnings]) {
        addWarning(warnings, warning);
      }
      return {
        articles: normalized.articles,
        outcome: sourceOutcomeSchema.parse({
          providerKey: source.providerKey,
          sourceDisplayName: source.sourceDisplayName,
          outcome: structured?.outcome === 'degraded' || warnings.length > 0
            ? 'degraded'
            : 'healthy',
          articleCount: normalized.articles.length,
          durationMs,
          warnings,
          errorCode: null,
        }),
        metadata,
      };
    } catch (error) {
      const errorCode = typeof error?.code === 'string' && /^PROVIDER_[A-Z0-9_]+$/u.test(error.code)
        ? error.code
        : 'SOURCE_FETCH_FAILED';
      return {
        articles: [],
        outcome: sourceOutcomeSchema.parse({
          providerKey: source.providerKey,
          sourceDisplayName: source.sourceDisplayName,
          outcome: 'failed',
          articleCount: 0,
          durationMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
          warnings: [],
          errorCode,
        }),
        metadata: { attemptCount: error?.attemptCount || 0, cacheStatus: 'none', freshUntil: null },
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
        schemaVersion: 2,
        serviceVersion: config.serviceVersion,
        fetchedAt,
        articles: results.flatMap((result) => result.articles),
        sources: results.map((result) => result.outcome),
      };

      response.articles.sort((left, right) => {
        if (left.publishedAt && right.publishedAt) {
          const byDate = right.publishedAt.localeCompare(left.publishedAt);
          if (byDate !== 0) return byDate;
        } else if (left.publishedAt) return -1;
        else if (right.publishedAt) return 1;
        return 0;
      });

      applyResponseSizeLimit(response);

      for (const [index, outcome] of response.sources.entries()) {
        const metadata = results[index].metadata;
        healthStore.record(outcome, fetchedAt, metadata);
        logger.info('provider_discovery_completed', {
          providerKey: outcome.providerKey,
          outcome: outcome.outcome,
          articleCount: outcome.articleCount,
          durationMs: outcome.durationMs,
          attemptCount: metadata.attemptCount,
          cacheStatus: metadata.cacheStatus,
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
