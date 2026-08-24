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
      }]),
    );
  }

  record(outcome, attemptedAt) {
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
    });
  }

  read() {
    return Array.from(this.state.values(), (value) => ({ ...value }));
  }
}

module.exports = { SourceHealthStore };
