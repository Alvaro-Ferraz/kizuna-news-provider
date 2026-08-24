'use strict';

const crypto = require('node:crypto');
const express = require('express');

const { createMachineAuth } = require('./auth');
const { createArticleExtractionService } = require('./article-extraction-service');
const { articleExtractionRequestSchema, discoveryRequestSchema } = require('./contracts');
const { createDiscoveryService } = require('./discovery');
const { HttpError } = require('./errors');
const defaultLogger = require('./logger');
const { createV1SourceRegistry } = require('./source-registry');
const { SourceHealthStore } = require('./source-health-store');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function hasRequestBody(req) {
  const contentLength = Number(req.get('content-length'));
  return (Number.isFinite(contentLength) && contentLength > 0)
    || req.get('transfer-encoding') !== undefined;
}

function createApp(config, dependencies = {}) {
  const expressFactory = dependencies.express || express;
  const logger = dependencies.logger || defaultLogger;
  const sourceRegistry = dependencies.sourceRegistry || createV1SourceRegistry();
  const enabledDefinitions = config.enabledSources.map((key) => sourceRegistry[key]);
  const healthStore = dependencies.healthStore || new SourceHealthStore(enabledDefinitions);
  const discoveryService = createDiscoveryService({
    config,
    sourceRegistry,
    healthStore,
    logger,
    now: dependencies.now,
    monotonicNow: dependencies.monotonicNow,
  });
  const extractionService = dependencies.extractionService || createArticleExtractionService({
    config,
    sourceRegistry,
    logger,
    httpClient: dependencies.articleHttpClient,
    now: dependencies.now,
  });
  const app = expressFactory();

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const suppliedRequestId = req.get('x-request-id');
    req.id = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');

    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('request_completed', {
        requestId: req.id,
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(express.json({ limit: config.jsonBodyLimit, strict: false }));

  const internalRouter = express.Router();
  internalRouter.use(createMachineAuth(config.secret));

  internalRouter.post('/discovery-runs', async (req, res, next) => {
    try {
      if (hasRequestBody(req) && !req.is('application/json')) {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
      }

      const request = req.body === undefined ? {} : req.body;
      if (!discoveryRequestSchema.safeParse(request).success) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Request body must be an empty JSON object');
      }

      const result = await discoveryService.run();
      if (result.allSourcesFailed) {
        throw new HttpError(502, 'ALL_SOURCES_FAILED', 'All enabled news sources failed');
      }
      res.json(result.response);
    } catch (error) {
      next(error);
    }
  });

  internalRouter.post('/article-extractions', async (req, res, next) => {
    try {
      if (!req.is('application/json')) {
        throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
      }
      const parsed = articleExtractionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Request body must contain only articleRef');
      }
      const result = await extractionService.extract({
        articleRef: parsed.data.articleRef,
        requestId: req.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  internalRouter.get('/sources/health', (_req, res) => {
    res.json({
      schemaVersion: 1,
      serviceVersion: config.serviceVersion,
      sources: healthStore.read(),
    });
  });

  app.use('/internal/v1', internalRouter);

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
  });

  app.use((error, req, res, _next) => {
    let httpError = error;
    if (error?.type === 'entity.too.large') {
      httpError = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds 16 KiB');
    } else if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
      httpError = new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    } else if (!(error instanceof HttpError)) {
      logger.error('request_failed', {
        requestId: req.id,
        errorClass: error?.constructor?.name || 'Error',
      });
      httpError = new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');
    }

    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId: req.id,
      },
    });
  });

  return app;
}

module.exports = { createApp, hasRequestBody, REQUEST_ID_PATTERN };
