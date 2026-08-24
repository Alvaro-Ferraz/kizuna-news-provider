'use strict';

const crypto = require('node:crypto');

const { ArticleRefError, createArticleRefSigner } = require('./article-ref');
const { ArticleExtractionError, extractArticle } = require('./article-extractor');
const { articleExtractionResponseSchema } = require('./contracts');
const { HttpError } = require('./errors');
const { getDefaultArticleHttpClient } = require('./provider-http-client');
const { Semaphore } = require('./semaphore');

const EXTRACTION_CIRCUIT_THRESHOLD = 3;
const EXTRACTION_CIRCUIT_COOLDOWN_MS = 60 * 1000;

const PROVIDER_ERROR_MAP = Object.freeze({
  PROVIDER_INVALID_URL: 'ARTICLE_URL_REJECTED',
  PROVIDER_HOST_REJECTED: 'ARTICLE_URL_REJECTED',
  PROVIDER_DNS_REJECTED: 'ARTICLE_DNS_REJECTED',
  PROVIDER_DNS_FAILED: 'ARTICLE_DNS_REJECTED',
  PROVIDER_REDIRECT_REJECTED: 'ARTICLE_REDIRECT_REJECTED',
  PROVIDER_TOO_MANY_REDIRECTS: 'ARTICLE_REDIRECT_REJECTED',
  PROVIDER_INVALID_REDIRECT: 'ARTICLE_REDIRECT_REJECTED',
  PROVIDER_TIMEOUT: 'ARTICLE_TIMEOUT',
  PROVIDER_DEADLINE_EXCEEDED: 'ARTICLE_TIMEOUT',
  PROVIDER_RESPONSE_TOO_LARGE: 'ARTICLE_RESPONSE_TOO_LARGE',
  PROVIDER_INVALID_CONTENT_TYPE: 'ARTICLE_UNSUPPORTED_CONTENT_TYPE',
  PROVIDER_RATE_LIMITED: 'ARTICLE_HTTP_ERROR',
  PROVIDER_HTTP_403: 'ARTICLE_HTTP_ERROR',
  PROVIDER_HTTP_5XX: 'ARTICLE_HTTP_ERROR',
  PROVIDER_HTTP_ERROR: 'ARTICLE_HTTP_ERROR',
  PROVIDER_NETWORK_ERROR: 'ARTICLE_HTTP_ERROR',
});

const ERROR_STATUS = Object.freeze({
  INVALID_ARTICLE_REF: 422,
  INVALID_ARTICLE_REF_VERSION: 422,
  ARTICLE_REF_EXPIRED: 422,
  ARTICLE_PROVIDER_NOT_ENABLED: 422,
  ARTICLE_CIRCUIT_OPEN: 502,
  ARTICLE_URL_REJECTED: 422,
  ARTICLE_DNS_REJECTED: 422,
  ARTICLE_REDIRECT_REJECTED: 502,
  ARTICLE_TIMEOUT: 504,
  ARTICLE_RESPONSE_TOO_LARGE: 502,
  ARTICLE_UNSUPPORTED_CONTENT_TYPE: 502,
  ARTICLE_HTTP_ERROR: 502,
  ARTICLE_LAYOUT_UNSUPPORTED: 502,
  ARTICLE_CONTENT_EMPTY: 502,
  ARTICLE_EXTRACTION_FAILED: 502,
  EXTRACTION_CAPACITY_EXCEEDED: 429,
});

function publicMessage(code) {
  if (code === 'EXTRACTION_CAPACITY_EXCEEDED') return 'Article extraction capacity is busy';
  if (code === 'ARTICLE_REF_EXPIRED') return 'Article reference has expired';
  if (code.startsWith('INVALID_ARTICLE_REF')) return 'Article reference is invalid';
  if (code === 'ARTICLE_PROVIDER_NOT_ENABLED') return 'Article provider is not enabled';
  return 'Article extraction failed';
}

function toHttpError(error) {
  if (error instanceof HttpError) return error;
  let code;
  if (error instanceof ArticleRefError || error instanceof ArticleExtractionError) {
    code = error.code;
  } else {
    code = PROVIDER_ERROR_MAP[error?.code] || 'ARTICLE_EXTRACTION_FAILED';
  }
  return new HttpError(ERROR_STATUS[code] || 502, code, publicMessage(code));
}

function createArticleExtractionService({
  config,
  sourceRegistry,
  logger,
  httpClient = getDefaultArticleHttpClient(),
  now = () => new Date(),
  capacity = 2,
}) {
  const nowDate = () => {
    const value = now();
    return value instanceof Date ? value : new Date(value);
  };
  const signer = createArticleRefSigner({
    secret: config.articleRefSecret,
    now: () => nowDate().getTime(),
  });
  const semaphore = new Semaphore(capacity);
  const inflight = new Map();
  const operationState = new Map(config.enabledSources.map((providerKey) => [providerKey, {
    consecutiveFailures: 0,
    circuitOpenUntil: 0,
  }]));
  const metrics = new Map(config.enabledSources.map((providerKey) => [providerKey, {
    attempts: 0,
    successes: 0,
    failures: 0,
    lastSuccessAt: null,
    lastErrorCode: null,
    lastDurationMs: null,
  }]));

  async function execute(payload) {
    const source = sourceRegistry[payload.providerKey];
    const response = await httpClient.getArticle({
      url: payload.canonicalSourceUrl,
      allowedHosts: source.allowedSourceHosts,
    });
    const extracted = extractArticle({
      providerKey: payload.providerKey,
      html: response.body,
      sourceUrl: payload.canonicalSourceUrl,
      finalUrl: response.finalUrl,
      locale: payload.locale,
    });
    const result = articleExtractionResponseSchema.parse({
      schemaVersion: 1,
      serviceVersion: config.serviceVersion,
      extractedAt: nowDate().toISOString(),
      article: {
        providerKey: payload.providerKey,
        providerArticleId: payload.providerArticleId,
        ...extracted,
      },
    });
    return { result, attemptCount: response.attemptCount || 1 };
  }

  async function executeWithCircuit(payload) {
    const state = operationState.get(payload.providerKey);
    try {
      const completed = await execute(payload);
      state.consecutiveFailures = 0;
      state.circuitOpenUntil = 0;
      return completed;
    } catch (error) {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= EXTRACTION_CIRCUIT_THRESHOLD) {
        state.circuitOpenUntil = nowDate().getTime() + EXTRACTION_CIRCUIT_COOLDOWN_MS;
      }
      throw error;
    }
  }

  return {
    async extract({ articleRef, requestId }) {
      const startedAt = Date.now();
      let providerKey = null;
      let selectorVersion = null;
      let attemptCount = 0;
      try {
        const payload = signer.verify(articleRef);
        providerKey = payload.providerKey;
        if (!config.enabledSources.includes(providerKey) || !sourceRegistry[providerKey]) {
          throw new ArticleRefError('ARTICLE_PROVIDER_NOT_ENABLED');
        }
        const providerMetrics = metrics.get(providerKey);
        providerMetrics.attempts += 1;
        const circuit = operationState.get(providerKey);
        if (circuit.circuitOpenUntil > nowDate().getTime()) {
          throw new HttpError(502, 'ARTICLE_CIRCUIT_OPEN', publicMessage('ARTICLE_CIRCUIT_OPEN'));
        }

        const identity = crypto.createHash('sha256').update(articleRef, 'utf8').digest('base64url');
        const existing = inflight.get(identity);
        if (existing) {
          const completed = await existing;
          attemptCount = completed.attemptCount;
          selectorVersion = completed.result.article.selectorVersion;
          providerMetrics.successes += 1;
          providerMetrics.lastSuccessAt = completed.result.extractedAt;
          providerMetrics.lastErrorCode = null;
          providerMetrics.lastDurationMs = Math.max(0, Date.now() - startedAt);
          logger.info('provider_article_extraction_completed', {
            requestId,
            providerKey,
            operation: 'article-extraction',
            outcome: 'success',
            durationMs: providerMetrics.lastDurationMs,
            attemptCount,
            selectorVersion,
            errorCode: null,
          });
          return completed.result;
        }

        const release = semaphore.tryAcquire();
        if (!release) throw new HttpError(
          429,
          'EXTRACTION_CAPACITY_EXCEEDED',
          publicMessage('EXTRACTION_CAPACITY_EXCEEDED'),
        );

        const operation = executeWithCircuit(payload);
        inflight.set(identity, operation);
        try {
          const completed = await operation;
          attemptCount = completed.attemptCount;
          selectorVersion = completed.result.article.selectorVersion;
          providerMetrics.successes += 1;
          providerMetrics.lastSuccessAt = completed.result.extractedAt;
          providerMetrics.lastErrorCode = null;
          providerMetrics.lastDurationMs = Math.max(0, Date.now() - startedAt);
          logger.info('provider_article_extraction_completed', {
            requestId,
            providerKey,
            operation: 'article-extraction',
            outcome: 'success',
            durationMs: providerMetrics.lastDurationMs,
            attemptCount,
            selectorVersion,
            errorCode: null,
          });
          return completed.result;
        } finally {
          inflight.delete(identity);
          release();
        }
      } catch (error) {
        const httpError = toHttpError(error);
        attemptCount = error?.attemptCount || attemptCount;
        const providerMetrics = providerKey ? metrics.get(providerKey) : null;
        if (providerMetrics) {
          providerMetrics.failures += 1;
          providerMetrics.lastErrorCode = httpError.code;
          providerMetrics.lastDurationMs = Math.max(0, Date.now() - startedAt);
        }
        logger.info('provider_article_extraction_completed', {
          requestId,
          providerKey,
          operation: 'article-extraction',
          outcome: 'failed',
          durationMs: Math.max(0, Date.now() - startedAt),
          attemptCount,
          selectorVersion,
          errorCode: httpError.code,
        });
        throw httpError;
      }
    },
    inspect() {
      return {
        active: semaphore.active,
        inflight: inflight.size,
        metrics: Object.fromEntries(Array.from(metrics, ([key, value]) => [key, { ...value }])),
      };
    },
  };
}

module.exports = {
  ERROR_STATUS,
  EXTRACTION_CIRCUIT_COOLDOWN_MS,
  EXTRACTION_CIRCUIT_THRESHOLD,
  PROVIDER_ERROR_MAP,
  createArticleExtractionService,
  toHttpError,
};
