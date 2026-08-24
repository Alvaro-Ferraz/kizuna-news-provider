'use strict';

const { z } = require('zod');

const { V1_SOURCE_KEYS } = require('./source-registry');

const CONTRACT_LIMITS = Object.freeze({
  title: 500,
  excerpt: 2000,
  url: 2048,
  providerArticleId: 500,
  providerSlug: 200,
  tags: 20,
  tag: 100,
  articlesPerSource: 100,
  discoveryResponseBytes: 2 * 1024 * 1024,
  articleRef: 4096,
  articleContentText: 80_000,
  articleBlocks: 500,
  articleAuthor: 200,
  articleWarnings: 10,
});

const DISCOVERY_METHODS = Object.freeze([
  'DIRECT_RSS',
  'GOOGLE_NEWS_RSS',
  'DIRECT_HTML',
  'OTHER',
]);

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isCanonicalLanguageTag(value) {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}

function isIsoInstant(value) {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

const httpsUrlSchema = z.string().max(CONTRACT_LIMITS.url).refine(isHttpsUrl, {
  message: 'Expected an absolute HTTPS URL',
});

const nullableLanguageTagSchema = z.union([
  z.string().min(2).max(35).refine(isCanonicalLanguageTag),
  z.null(),
]);

const isoInstantSchema = z.string().refine(isIsoInstant, {
  message: 'Expected a canonical ISO 8601 UTC instant',
});

const sourceArticleSchema = z.object({
  schemaVersion: z.literal(2),
  providerKey: z.enum(V1_SOURCE_KEYS),
  sourceDisplayName: z.string().min(1).max(100),
  providerArticleId: z.string().min(1).max(CONTRACT_LIMITS.providerArticleId).nullable(),
  providerSlug: z.string().min(1).max(CONTRACT_LIMITS.providerSlug).nullable(),
  articleRef: z.string().min(1).max(CONTRACT_LIMITS.articleRef),
  title: z.string().min(1).max(CONTRACT_LIMITS.title),
  excerpt: z.string().max(CONTRACT_LIMITS.excerpt).nullable(),
  publishedAt: isoInstantSchema.nullable(),
  sourceUrl: httpsUrlSchema,
  imageUrl: httpsUrlSchema.nullable(),
  tags: z.array(z.string().min(1).max(CONTRACT_LIMITS.tag)).max(CONTRACT_LIMITS.tags),
  language: nullableLanguageTagSchema,
  locale: nullableLanguageTagSchema,
  discoveryMethod: z.enum(DISCOVERY_METHODS),
  discoveredAt: isoInstantSchema,
}).strict();

const sourceOutcomeSchema = z.object({
  providerKey: z.enum(V1_SOURCE_KEYS),
  sourceDisplayName: z.string().min(1).max(100),
  outcome: z.enum(['healthy', 'degraded', 'failed']),
  articleCount: z.number().int().min(0).max(CONTRACT_LIMITS.articlesPerSource),
  durationMs: z.number().int().min(0),
  warnings: z.array(z.string().min(1).max(100)).max(10),
  errorCode: z.string().min(1).max(100).nullable(),
}).strict();

const discoveryRunResponseSchema = z.object({
  schemaVersion: z.literal(2),
  serviceVersion: z.string().min(1).max(100),
  fetchedAt: isoInstantSchema,
  articles: z.array(sourceArticleSchema).max(
    CONTRACT_LIMITS.articlesPerSource * V1_SOURCE_KEYS.length,
  ),
  sources: z.array(sourceOutcomeSchema).min(1).max(V1_SOURCE_KEYS.length),
}).strict();

const discoveryRequestSchema = z.object({}).strict();

const articleExtractionRequestSchema = z.object({
  articleRef: z.string().min(1).max(CONTRACT_LIMITS.articleRef),
}).strict();

const articleBlockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'list', 'quote']),
  text: z.string().min(1).max(CONTRACT_LIMITS.articleContentText),
}).strict();

const articleExtractionResponseSchema = z.object({
  schemaVersion: z.literal(1),
  serviceVersion: z.string().min(1).max(100),
  extractedAt: isoInstantSchema,
  article: z.object({
    providerKey: z.enum(V1_SOURCE_KEYS),
    providerArticleId: z.string().min(1).max(CONTRACT_LIMITS.providerArticleId).nullable(),
    sourceUrl: httpsUrlSchema,
    finalUrl: httpsUrlSchema,
    canonicalUrl: httpsUrlSchema.nullable(),
    title: z.string().min(1).max(CONTRACT_LIMITS.title).nullable(),
    author: z.string().min(1).max(CONTRACT_LIMITS.articleAuthor).nullable(),
    publishedAt: isoInstantSchema.nullable(),
    language: nullableLanguageTagSchema,
    selectorVersion: z.string().min(1).max(100),
    contentText: z.string().min(1).max(CONTRACT_LIMITS.articleContentText),
    blocks: z.array(articleBlockSchema).max(CONTRACT_LIMITS.articleBlocks),
    warnings: z.array(z.string().min(1).max(100)).max(CONTRACT_LIMITS.articleWarnings),
  }).strict(),
}).strict();

module.exports = {
  CONTRACT_LIMITS,
  DISCOVERY_METHODS,
  articleBlockSchema,
  articleExtractionRequestSchema,
  articleExtractionResponseSchema,
  discoveryRequestSchema,
  discoveryRunResponseSchema,
  sourceArticleSchema,
  sourceOutcomeSchema,
};
