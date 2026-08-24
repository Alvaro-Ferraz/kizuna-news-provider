/*
 * AniNewsAPI — server.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 * Fork boundary: private Kizuna news-provider process entry point.
 * Author: Shinei Nouzen. License: MIT.
 */

'use strict';

const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');
const logger = require('./src/logger');

function startServer({ env = process.env, dependencies = {} } = {}) {
  const config = loadConfig(env);
  const app = createApp(config, dependencies);
  const server = app.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      nodeEnv: config.nodeEnv,
      enabledSources: config.enabledSources,
      serviceVersion: config.serviceVersion,
    });
  });
  return server;
}

function installShutdownHandlers(server) {
  const shutdown = (signal) => {
    logger.info('server_stopping', { signal });
    const timeout = setTimeout(() => {
      logger.error('server_shutdown_timeout', { signal });
      process.exit(1);
    }, 10_000);
    timeout.unref();

    server.close(() => {
      clearTimeout(timeout);
      logger.info('server_stopped', { signal });
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  try {
    installShutdownHandlers(startServer());
  } catch (error) {
    logger.error('startup_failed', {
      code: 'CONFIGURATION_INVALID',
      errorClass: error?.constructor?.name || 'Error',
      message: error?.message || 'Invalid configuration',
    });
    process.exitCode = 1;
  }
}

module.exports = { installShutdownHandlers, startServer };
