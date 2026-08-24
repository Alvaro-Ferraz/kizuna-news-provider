'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');

const { V1_SOURCE_KEYS, V1_SOURCE_METADATA } = require('./source-registry');

const ARTICLE_REF_VERSION = 1;
const ARTICLE_REF_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const ARTICLE_REF_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ARTICLE_REF_CLOCK_SKEW_MS = 60 * 1000;
const ARTICLE_REF_MAX_LENGTH = 4096;
const ARTICLE_REF_PAYLOAD_MAX_BYTES = 3072;

const articleRefPayloadSchema = z.object({
  version: z.literal(ARTICLE_REF_VERSION),
  providerKey: z.enum(V1_SOURCE_KEYS),
  providerArticleId: z.string().min(1).max(500).nullable(),
  canonicalSourceUrl: z.string().min(1).max(2048),
  locale: z.string().min(2).max(35).nullable(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

class ArticleRefError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ArticleRefError';
    this.code = code;
  }
}

function stableSerialize(payload) {
  return JSON.stringify({
    version: payload.version,
    providerKey: payload.providerKey,
    providerArticleId: payload.providerArticleId,
    canonicalSourceUrl: payload.canonicalSourceUrl,
    locale: payload.locale,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  });
}

function isCanonicalLocale(value) {
  if (value === null) return true;
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}

function validatePayloadSemantics(payload, nowMs) {
  if (!isCanonicalLocale(payload.locale)) throw new ArticleRefError('INVALID_ARTICLE_REF');
  if (payload.issuedAt > nowMs + ARTICLE_REF_CLOCK_SKEW_MS) {
    throw new ArticleRefError('INVALID_ARTICLE_REF');
  }
  if (payload.expiresAt <= payload.issuedAt) throw new ArticleRefError('INVALID_ARTICLE_REF');
  if (payload.expiresAt - payload.issuedAt > ARTICLE_REF_MAX_TTL_MS) {
    throw new ArticleRefError('INVALID_ARTICLE_REF');
  }
  if (payload.expiresAt < nowMs - ARTICLE_REF_CLOCK_SKEW_MS) {
    throw new ArticleRefError('ARTICLE_REF_EXPIRED');
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(payload.canonicalSourceUrl);
  } catch {
    throw new ArticleRefError('INVALID_ARTICLE_REF');
  }
  const allowedHosts = V1_SOURCE_METADATA[payload.providerKey]?.allowedSourceHosts || [];
  if (
    sourceUrl.protocol !== 'https:'
    || sourceUrl.username
    || sourceUrl.password
    || !allowedHosts.includes(sourceUrl.hostname.toLowerCase())
  ) {
    throw new ArticleRefError('INVALID_ARTICLE_REF');
  }
}

function signSerialized(serialized, secret) {
  return crypto.createHmac('sha256', secret).update(serialized, 'utf8').digest();
}

function createArticleRefSigner({ secret, now = Date.now, ttlMs = ARTICLE_REF_TTL_MS }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Article reference secret must contain at least 32 bytes');
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > ARTICLE_REF_MAX_TTL_MS) {
    throw new Error('Article reference TTL is invalid');
  }

  return {
    sign({ providerKey, providerArticleId = null, canonicalSourceUrl, locale = null }) {
      const issuedAt = now();
      const payload = articleRefPayloadSchema.parse({
        version: ARTICLE_REF_VERSION,
        providerKey,
        providerArticleId,
        canonicalSourceUrl,
        locale,
        issuedAt,
        expiresAt: issuedAt + ttlMs,
      });
      validatePayloadSemantics(payload, issuedAt);
      const serialized = stableSerialize(payload);
      const encodedPayload = Buffer.from(serialized, 'utf8').toString('base64url');
      const signature = signSerialized(serialized, secret).toString('base64url');
      return `${encodedPayload}.${signature}`;
    },

    verify(articleRef) {
      if (
        typeof articleRef !== 'string'
        || articleRef.length < 3
        || articleRef.length > ARTICLE_REF_MAX_LENGTH
      ) {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }
      const parts = articleRef.split('.');
      if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }

      let payloadBytes;
      let suppliedSignature;
      try {
        payloadBytes = Buffer.from(parts[0], 'base64url');
        suppliedSignature = Buffer.from(parts[1], 'base64url');
      } catch {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }
      if (
        payloadBytes.length === 0
        || payloadBytes.length > ARTICLE_REF_PAYLOAD_MAX_BYTES
        || suppliedSignature.length !== 32
      ) {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }

      const serialized = payloadBytes.toString('utf8');
      const expectedSignature = signSerialized(serialized, secret);
      if (!crypto.timingSafeEqual(suppliedSignature, expectedSignature)) {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }

      let decoded;
      try {
        decoded = JSON.parse(serialized);
      } catch {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }
      if (decoded?.version !== ARTICLE_REF_VERSION) {
        throw new ArticleRefError('INVALID_ARTICLE_REF_VERSION');
      }
      const parsed = articleRefPayloadSchema.safeParse(decoded);
      if (!parsed.success || stableSerialize(parsed.data) !== serialized) {
        throw new ArticleRefError('INVALID_ARTICLE_REF');
      }
      validatePayloadSemantics(parsed.data, now());
      return parsed.data;
    },
  };
}

module.exports = {
  ARTICLE_REF_CLOCK_SKEW_MS,
  ARTICLE_REF_MAX_LENGTH,
  ARTICLE_REF_MAX_TTL_MS,
  ARTICLE_REF_TTL_MS,
  ARTICLE_REF_VERSION,
  ArticleRefError,
  articleRefPayloadSchema,
  createArticleRefSigner,
  stableSerialize,
};
