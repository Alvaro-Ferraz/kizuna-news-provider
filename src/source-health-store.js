'use strict';

class SourceHealthStore {
  constructor(sourceDefinitions) {
    this.state = new Map(
      sourceDefinitions.map((source) => [source.providerKey, {
        providerKey: source.providerKey,
        sourceDisplayName: source.sourceDisplayName,
        status: 'unknown',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastOutcome: null,
        lastArticleCount: null,
        consecutiveFailures: 0,
        lastDurationMs: null,
        lastErrorCode: null,
        lastWarningCodes: [],
        freshUntil: null,
        discoveryAttempts: 0,
        upstreamAttemptCount: 0,
        successes: 0,
        failures: 0,
        cacheHitCount: 0,
        notModifiedCount: 0,
        lastAttemptCount: 0,
      }]),
    );
  }

  record(outcome, attemptedAt, metadata = {}) {
    const current = this.state.get(outcome.providerKey);
    if (!current) return;

    const didFail = outcome.outcome === 'failed';
    this.state.set(outcome.providerKey, {
      ...current,
      status: outcome.outcome,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: didFail ? current.lastSuccessAt : attemptedAt,
      lastOutcome: outcome.outcome,
      lastArticleCount: outcome.articleCount,
      consecutiveFailures: didFail ? current.consecutiveFailures + 1 : 0,
      lastDurationMs: outcome.durationMs,
      lastErrorCode: outcome.errorCode,
      lastWarningCodes: [...outcome.warnings],
      freshUntil: metadata.freshUntil || null,
      discoveryAttempts: current.discoveryAttempts + 1,
      upstreamAttemptCount: current.upstreamAttemptCount + (metadata.attemptCount || 0),
      successes: current.successes + (didFail ? 0 : 1),
      failures: current.failures + (didFail ? 1 : 0),
      cacheHitCount: current.cacheHitCount + (metadata.cacheStatus === 'fresh' ? 1 : 0),
      notModifiedCount: current.notModifiedCount
        + (metadata.cacheStatus === 'not_modified' ? 1 : 0),
      lastAttemptCount: metadata.attemptCount || 0,
    });
  }

  read() {
    return Array.from(this.state.values(), (value) => ({ ...value }));
  }
}

module.exports = { SourceHealthStore };
