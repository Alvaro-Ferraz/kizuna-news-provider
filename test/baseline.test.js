'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const test = require('node:test');
const path = require('node:path');

const {
  getBlockedNetworkAttemptCount,
} = require('./network-guard');

const repositoryRoot = path.resolve(__dirname, '..');
const expectedSourceKeys = [
  'ann',
  'animecorner',
  'myanimelist',
  'otakuusa',
  'crunchyroll',
  'animeherald',
  'comicbook',
  'tokyootakumode',
  'animetrending',
  'animeuknews',
  'randomcuriosity',
  'honeysanime',
  'otakunewsnew',
];
const plannedV1SourceKeys = [
  'ann',
  'animecorner',
  'animetrending',
  'crunchyroll',
];

test('package metadata records the audited runtime baseline', () => {
  const packageMetadata = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );

  assert.equal(packageMetadata.version, '5.1.0');
  assert.equal(packageMetadata.engines.node, '>=20.x');
  assert.match(packageMetadata.scripts.test, /node --require .* --test/u);
  assert.equal(packageMetadata.scripts['test:live'], 'node scripts/live-smoke.js');
});

test('main utility modules load without starting crawling', () => {
  const blockedBeforeImport = getBlockedNetworkAttemptCount();

  assert.doesNotThrow(() => require('../utils/constants'));
  assert.doesNotThrow(() => require('../utils/fetchAllSources'));
  assert.equal(getBlockedNetworkAttemptCount(), blockedBeforeImport);
});

test('source registry preserves all thirteen upstream sources', () => {
  const { SOURCES, SOURCE_KEYS } = require('../utils/sources');

  assert.deepEqual(SOURCE_KEYS, expectedSourceKeys);
  assert.equal(Object.keys(SOURCES).length, 13);
  for (const source of Object.values(SOURCES)) {
    assert.equal(typeof source.name, 'string');
    assert.equal(typeof source.fetch, 'function');
  }
});

test('all planned V1 sources exist in the preserved registry', () => {
  const { SOURCE_KEYS } = require('../utils/sources');

  for (const sourceKey of plannedV1SourceKeys) {
    assert.ok(SOURCE_KEYS.includes(sourceKey));
  }
});

test('ordinary tests reject fetch, HTTP, and HTTPS network access', async () => {
  const blockedBeforeProof = getBlockedNetworkAttemptCount();

  assert.throws(
    () => http.get('http://example.invalid'),
    /Network access is disabled/u,
  );
  assert.throws(
    () => https.get('https://example.invalid'),
    /Network access is disabled/u,
  );
  await assert.rejects(
    globalThis.fetch('https://example.invalid'),
    /Network access is disabled/u,
  );
  assert.equal(getBlockedNetworkAttemptCount(), blockedBeforeProof + 3);
});
