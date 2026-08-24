'use strict';

class ProviderError extends Error {
  constructor(code, { retryable = false, status = null, retryAfterMs = null, cause } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.attemptCount = 0;
  }
}

function asProviderError(error, fallbackCode = 'PROVIDER_NETWORK_ERROR') {
  if (error instanceof ProviderError) return error;

  const timeoutCodes = new Set(['ABORT_ERR', 'ECONNABORTED', 'ETIMEDOUT']);
  const code = timeoutCodes.has(error?.code) ? 'PROVIDER_TIMEOUT' : fallbackCode;
  return new ProviderError(code, { retryable: true, cause: error });
}

module.exports = { ProviderError, asProviderError };
