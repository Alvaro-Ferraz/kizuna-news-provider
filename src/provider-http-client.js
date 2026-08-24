'use strict';

const https = require('node:https');
const axios = require('axios');

const packageMetadata = require('../package.json');
const { resolvePublicAddress, validateOutboundUrl } = require('./outbound-security');
const { ProviderError, asProviderError } = require('./provider-error');
const { Semaphore } = require('./semaphore');

const DEFAULTS = Object.freeze({
  maximumBytes: 1024 * 1024,
  maximumRedirects: 3,
  maximumAttempts: 3,
  requestTimeoutMs: 8_000,
  operationDeadlineMs: 15_000,
  globalConcurrency: 2,
  perHostConcurrency: 1,
});

const USER_AGENT = `Kizuna-News-Provider/${packageMetadata.version} (+https://animekizuna.com)`;
const RSS_CONTENT_TYPES = Object.freeze([
  'application/rss+xml',
  'application/xml',
  'text/xml',
  'application/atom+xml',
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
    key.toLowerCase(),
    Array.isArray(value) ? value.join(', ') : String(value),
  ]));
}

function parseRetryAfter(value, nowMs) {
  if (!value) return null;
  if (/^\d+$/u.test(value.trim())) return Number(value.trim()) * 1000;
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? null : Math.max(0, instant - nowMs);
}

function disposeBody(body) {
  if (body && typeof body.destroy === 'function') body.destroy();
}

function withDeadline(promise, deadlineAt, now) {
  const remaining = deadlineAt - now();
  if (remaining <= 0) return Promise.reject(new ProviderError('PROVIDER_DEADLINE_EXCEEDED'));
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ProviderError('PROVIDER_DEADLINE_EXCEEDED')),
        remaining,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function readBoundedBody(body, maximumBytes) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    if (buffer.length > maximumBytes) {
      throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE');
    }
    return buffer.toString('utf8');
  }

  const chunks = [];
  let received = 0;
  try {
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > maximumBytes) {
        disposeBody(body);
        throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw asProviderError(error);
  }
  return Buffer.concat(chunks, received).toString('utf8');
}

async function axiosTransport({ url, headers, timeoutMs, pinnedAddress, maximumBytes, signal }) {
  const agent = new https.Agent({
    keepAlive: false,
    lookup(_hostname, _options, callback) {
      if (_options?.all) callback(null, [pinnedAddress]);
      else callback(null, pinnedAddress.address, pinnedAddress.family);
    },
  });

  try {
    const response = await axios.request({
      method: 'GET',
      url: url.href,
      headers,
      timeout: timeoutMs,
      responseType: 'stream',
      decompress: true,
      maxRedirects: 0,
      maxContentLength: maximumBytes,
      maxBodyLength: maximumBytes,
      httpsAgent: agent,
      proxy: false,
      signal,
      validateStatus: () => true,
    });
    response.data.once('close', () => agent.destroy());
    return response;
  } catch (error) {
    agent.destroy();
    throw error;
  }
}

function statusError(status, headers, nowMs) {
  if (status === 429) {
    return new ProviderError('PROVIDER_RATE_LIMITED', {
      retryable: true,
      status,
      retryAfterMs: parseRetryAfter(headers['retry-after'], nowMs),
    });
  }
  if (status === 403) return new ProviderError('PROVIDER_HTTP_403', { status });
  if (RETRYABLE_STATUSES.has(status)) {
    return new ProviderError('PROVIDER_HTTP_5XX', {
      retryable: true,
      status,
      retryAfterMs: status === 503
        ? parseRetryAfter(headers['retry-after'], nowMs)
        : null,
    });
  }
  return new ProviderError('PROVIDER_HTTP_ERROR', { status });
}

function createProviderHttpClient(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const transport = options.transport || axiosTransport;
  const resolveHost = options.resolveHost || resolvePublicAddress;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const random = options.random || Math.random;
  const globalSemaphore = new Semaphore(settings.globalConcurrency);
  const hostSemaphores = new Map();

  function getHostSemaphore(hostname) {
    if (!hostSemaphores.has(hostname)) {
      hostSemaphores.set(hostname, new Semaphore(settings.perHostConcurrency));
    }
    return hostSemaphores.get(hostname);
  }

  async function requestHop(url, requestOptions, deadlineAt, isRedirect) {
    let validated;
    try {
      validated = validateOutboundUrl(url, requestOptions.allowedHosts);
    } catch (error) {
      const code = error.message === 'PROVIDER_HOST_REJECTED' && isRedirect
        ? 'PROVIDER_REDIRECT_REJECTED'
        : error.message;
      throw new ProviderError(code);
    }

    let pinnedAddress;
    try {
      pinnedAddress = await withDeadline(resolveHost(validated.hostname), deadlineAt, now);
    } catch (error) {
      const code = error.message?.startsWith('PROVIDER_')
        ? error.message
        : 'PROVIDER_DNS_FAILED';
      throw new ProviderError(code, { retryable: code === 'PROVIDER_DNS_FAILED', cause: error });
    }

    const remaining = deadlineAt - now();
    if (remaining <= 0) throw new ProviderError('PROVIDER_DEADLINE_EXCEEDED');

    const controller = new AbortController();
    try {
      return await withDeadline(transport({
        url: validated,
        headers: requestOptions.headers,
        timeoutMs: Math.min(settings.requestTimeoutMs, remaining),
        pinnedAddress,
        maximumBytes: settings.maximumBytes,
        signal: controller.signal,
      }), deadlineAt, now);
    } catch (error) {
      controller.abort();
      throw asProviderError(error);
    }
  }

  async function oneAttempt(initialUrl, requestOptions, deadlineAt) {
    let currentUrl = new URL(initialUrl);
    for (let redirectCount = 0; redirectCount <= settings.maximumRedirects; redirectCount += 1) {
      const remainingBeforeQueue = deadlineAt - now();
      let releaseGlobal;
      try {
        releaseGlobal = await globalSemaphore.acquire(remainingBeforeQueue);
      } catch {
        throw new ProviderError('PROVIDER_DEADLINE_EXCEEDED');
      }
      const hostSemaphore = getHostSemaphore(currentUrl.hostname.toLowerCase());
      let releaseHost;
      try {
        releaseHost = await hostSemaphore.acquire(deadlineAt - now());
      } catch {
        releaseGlobal();
        throw new ProviderError('PROVIDER_DEADLINE_EXCEEDED');
      }
      try {
        const response = await requestHop(
          currentUrl,
          requestOptions,
          deadlineAt,
          redirectCount > 0,
        );
        const headers = lowerCaseHeaders(response.headers);
        if (REDIRECT_STATUSES.has(response.status)) {
          disposeBody(response.data);
          if (redirectCount === settings.maximumRedirects) {
            throw new ProviderError('PROVIDER_TOO_MANY_REDIRECTS');
          }
          const location = headers.location;
          if (!location) throw new ProviderError('PROVIDER_INVALID_REDIRECT');
          currentUrl = new URL(location, currentUrl);
          continue;
        }

        if (response.status === 304) {
          disposeBody(response.data);
          return { status: 304, headers, body: null, finalUrl: currentUrl.href };
        }
        if (response.status < 200 || response.status >= 300) {
          disposeBody(response.data);
          throw statusError(response.status, headers, now());
        }

        const contentType = (headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
        if (!RSS_CONTENT_TYPES.includes(contentType)) {
          disposeBody(response.data);
          throw new ProviderError('PROVIDER_INVALID_CONTENT_TYPE');
        }

        const declaredLength = Number(headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > settings.maximumBytes) {
          disposeBody(response.data);
          throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE');
        }

        const body = await readBoundedBody(response.data, settings.maximumBytes);
        return { status: response.status, headers, body, finalUrl: currentUrl.href };
      } finally {
        releaseHost();
        releaseGlobal();
      }
    }
    throw new ProviderError('PROVIDER_TOO_MANY_REDIRECTS');
  }

  return {
    async getRss({ url, allowedHosts, conditionalHeaders = {}, deadlineAt }) {
      const operationDeadline = deadlineAt || now() + settings.operationDeadlineMs;
      const headers = {
        Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': USER_AGENT,
        ...conditionalHeaders,
      };

      let lastError;
      for (let attempt = 1; attempt <= settings.maximumAttempts; attempt += 1) {
        try {
          const response = await oneAttempt(url, { allowedHosts, headers }, operationDeadline);
          return { ...response, attemptCount: attempt };
        } catch (error) {
          lastError = asProviderError(error);
          lastError.attemptCount = attempt;
          if (!lastError.retryable || attempt === settings.maximumAttempts) throw lastError;

          const backoff = Math.round(200 * (2 ** (attempt - 1)) * (0.5 + random()));
          const delay = lastError.retryAfterMs === null ? backoff : lastError.retryAfterMs;
          if (delay >= operationDeadline - now()) {
            const deadlineError = new ProviderError('PROVIDER_DEADLINE_EXCEEDED', {
              retryable: true,
              cause: lastError,
            });
            deadlineError.attemptCount = attempt;
            throw deadlineError;
          }
          await sleep(delay);
        }
      }
      throw lastError;
    },
    settings: Object.freeze({ ...settings }),
  };
}

let defaultClient;
function getDefaultProviderHttpClient() {
  if (!defaultClient) defaultClient = createProviderHttpClient();
  return defaultClient;
}

module.exports = {
  DEFAULTS,
  RSS_CONTENT_TYPES,
  USER_AGENT,
  createProviderHttpClient,
  getDefaultProviderHttpClient,
  parseRetryAfter,
  readBoundedBody,
};
