'use strict';

const { z } = require('zod');

const packageMetadata = require('../package.json');
const { V1_SOURCE_KEYS } = require('./source-registry');

const DEFAULT_ENABLED_SOURCES = V1_SOURCE_KEYS.join(',');
const SECRET_PATTERN = /^[\x21-\x7e]+$/u;

const appConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  port: z.number().int().min(1).max(65535).nullable(),
  secret: z.string().min(32).max(512).regex(SECRET_PATTERN),
  articleRefSecret: z.string().min(32).max(512).regex(SECRET_PATTERN),
  enabledSources: z.array(z.enum(V1_SOURCE_KEYS)).min(1),
  serviceVersion: z.string().min(1).max(100),
  jsonBodyLimit: z.string().min(1).max(20),
}).strict().refine((config) => config.secret !== config.articleRefSecret, {
  path: ['articleRefSecret'],
  message: 'Article reference secret must differ from machine authentication secret',
});

function parsePort(value, nodeEnv, { required = true } = {}) {
  if (value === undefined || value === '') {
    if (!required) return null;
    if (nodeEnv === 'production') throw new Error('PORT is required in production process mode');
    return 3000;
  }
  if (!/^\d+$/u.test(value)) throw new Error('PORT must be an integer from 1 to 65535');
  return Number(value);
}

function parseEnabledSources(value, nodeEnv) {
  const configuredValue = value === undefined || value === ''
    ? (nodeEnv === 'production' ? null : DEFAULT_ENABLED_SOURCES)
    : value;

  if (configuredValue === null) {
    throw new Error('ENABLED_SOURCES is required in production');
  }

  const sourceKeys = configuredValue.split(',').map((valuePart) => valuePart.trim());
  if (sourceKeys.some((sourceKey) => sourceKey.length === 0)) {
    throw new Error('ENABLED_SOURCES contains an empty source key');
  }

  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error('ENABLED_SOURCES contains duplicate source keys');
  }

  const unknownSource = sourceKeys.find((sourceKey) => !V1_SOURCE_KEYS.includes(sourceKey));
  if (unknownSource) {
    throw new Error(`ENABLED_SOURCES contains unsupported source: ${unknownSource}`);
  }

  return sourceKeys;
}

function formatConfigError(error) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path?.join('.') || 'configuration';
    return new Error(`Invalid ${field}`);
  }
  return error;
}

function validateConfig(config) {
  try {
    return appConfigSchema.parse(config);
  } catch (error) {
    throw formatConfigError(error);
  }
}

function loadConfig(env = process.env, { runtime = 'process' } = {}) {
  const nodeEnv = env.NODE_ENV || 'development';

  if (!['process', 'serverless'].includes(runtime)) {
    throw new Error('Runtime must be process or serverless');
  }

  try {
    return validateConfig({
      nodeEnv,
      port: parsePort(env.PORT, nodeEnv, { required: runtime === 'process' }),
      secret: env.KIZUNA_NEWS_PROVIDER_SECRET,
      articleRefSecret: env.KIZUNA_NEWS_ARTICLE_REF_SECRET,
      enabledSources: parseEnabledSources(env.ENABLED_SOURCES, nodeEnv),
      serviceVersion: packageMetadata.version,
      jsonBodyLimit: '16kb',
    });
  } catch (error) {
    throw formatConfigError(error);
  }
}

module.exports = {
  DEFAULT_ENABLED_SOURCES,
  appConfigSchema,
  loadConfig,
  parsePort,
  parseEnabledSources,
  validateConfig,
};
