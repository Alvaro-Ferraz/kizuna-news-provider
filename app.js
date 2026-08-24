'use strict';

const express = require('express');

const { createApp } = require('./src/createApp');
const { loadConfig } = require('./src/config');

const config = loadConfig(process.env, { runtime: 'serverless' });
const app = createApp(config, { express });

module.exports = app;
