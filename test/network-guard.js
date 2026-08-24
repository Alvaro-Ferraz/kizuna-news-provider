'use strict';

const http = require('node:http');
const https = require('node:https');

let blockedAttemptCount = 0;

function blockNetwork(apiName) {
  return function blockedNetworkCall() {
    blockedAttemptCount += 1;
    throw new Error(`Network access is disabled in ordinary tests (${apiName})`);
  };
}

http.get = blockNetwork('http.get');
http.request = blockNetwork('http.request');
https.get = blockNetwork('https.get');
https.request = blockNetwork('https.request');
globalThis.fetch = function blockedFetch() {
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
