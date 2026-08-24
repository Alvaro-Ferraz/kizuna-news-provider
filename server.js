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

const SHUTDOWN_TIMEOUT_MS = 25_000;

function startServer({ env = process.env, dependencies = {} } = {}) {
  const config = loadConfig(env);
  const app = createApp(config, dependencies);
  const runtimeLogger = dependencies.logger || logger;
  const server = app.listen(config.port, '0.0.0.0', () => {
    runtimeLogger.info('server_started', {
      port: config.port,
      bindAddress: '0.0.0.0',
      nodeEnv: config.nodeEnv,
      enabledSources: config.enabledSources,
      serviceVersion: config.serviceVersion,
    });
  });
  return server;
}

function createShutdownController({
  server,
  shutdownTimeoutMs = SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code),
  log = logger,
}) {
  let shutdownStarted = false;
  let completed = false;

  function shutdown(reason, exitCode = 0) {
    if (shutdownStarted) return false;
    shutdownStarted = true;
    log.info('server_stopping', { reason, shutdownTimeoutMs });

    const finish = (code, event) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      log[code === 0 ? 'info' : 'error'](event, { reason, exitCode: code });
      exit(code);
    };
    const timeout = setTimeout(() => {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      finish(1, 'server_shutdown_timeout');
    }, shutdownTimeoutMs);
    timeout.unref();

    server.close((error) => {
      finish(error ? 1 : exitCode, error ? 'server_shutdown_failed' : 'server_stopped');
    });
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    return true;
  }

  return { shutdown };
}

function installShutdownHandlers(server, options = {}) {
  const controller = createShutdownController({ server, ...options });
  process.once('SIGTERM', () => controller.shutdown('SIGTERM'));
  process.once('SIGINT', () => controller.shutdown('SIGINT'));
  process.once('uncaughtException', (error) => {
    logger.error('fatal_uncaught_exception', {
      errorClass: error?.constructor?.name || 'Error',
    });
    controller.shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.error('fatal_unhandled_rejection', {
      errorClass: reason?.constructor?.name || typeof reason,
    });
    controller.shutdown('unhandledRejection', 1);
  });
  return controller;
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

module.exports = {
  SHUTDOWN_TIMEOUT_MS,
  createShutdownController,
  installShutdownHandlers,
  startServer,
};
