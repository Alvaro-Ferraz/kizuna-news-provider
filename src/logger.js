'use strict';

const SERVICE_NAME = 'kizuna-news-provider';
const REDACTED_FIELD_PATTERN = /(?:authorization|secret|token|articleRef|contentText|html|rss|xml|url|query|cookie)/iu;

function sanitizeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    REDACTED_FIELD_PATTERN.test(key) ? '[REDACTED]' : value,
  ]));
}

function writeLog(level, event, fields) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    event,
    ...sanitizeFields(fields),
  });

  if (level === 'error') console.error(entry);
  else console.info(entry);
}

function createLogger() {
  return {
    info(event, fields = {}) {
      writeLog('info', event, fields);
    },
    error(event, fields = {}) {
      writeLog('error', event, fields);
    },
  };
}

module.exports = { SERVICE_NAME, createLogger, sanitizeFields, ...createLogger() };
