'use strict';

const { createApp } = require('./src/createApp');
const { loadConfig } = require('./src/config');

const config = loadConfig(process.env, { runtime: 'serverless' });
const app = createApp(config);

module.exports = app;
