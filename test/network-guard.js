'use strict';

const http = require('node:http');
const https = require('node:https');

let blockedAttemptCount = 0;

const originalHttpGet = http.get;
const originalHttpRequest = http.request;
const originalHttpsGet = https.get;
const originalHttpsRequest = https.request;
const originalFetch = globalThis.fetch;

function isLoopbackTarget(target) {
  let hostname;
  try {
    if (typeof target === 'string' || target instanceof URL) {
      hostname = new URL(target).hostname;
    } else {
      hostname = target?.hostname || target?.host?.split(':')[0];
    }
  } catch {
    return false;
  }
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
}

function guardNetwork(apiName, original) {
  return function guardedNetworkCall(...args) {
    if (isLoopbackTarget(args[0])) return original.apply(this, args);
    blockedAttemptCount += 1;
    throw new Error(`Network access is disabled in ordinary tests (${apiName})`);
  };
}

http.get = guardNetwork('http.get', originalHttpGet);
http.request = guardNetwork('http.request', originalHttpRequest);
https.get = guardNetwork('https.get', originalHttpsGet);
https.request = guardNetwork('https.request', originalHttpsRequest);
globalThis.fetch = function guardedFetch(target, ...args) {
  if (isLoopbackTarget(target)) return originalFetch(target, ...args);
  blockedAttemptCount += 1;
  return Promise.reject(
    new Error('Network access is disabled in ordinary tests (fetch)'),
  );
};

module.exports = {
  getBlockedNetworkAttemptCount() {
    return blockedAttemptCount;
  },
};
