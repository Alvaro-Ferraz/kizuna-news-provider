'use strict';

const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');

function createServerlessApp({ env = process.env, dependencies = {} } = {}) {
  const config = loadConfig(env, { runtime: 'serverless' });
  return createApp(config, dependencies);
}

let app;

function serverlessApp(req, res, next) {
  if (!app) app = createServerlessApp();
  return app(req, res, next);
}

module.exports = serverlessApp;
module.exports.createServerlessApp = createServerlessApp;
