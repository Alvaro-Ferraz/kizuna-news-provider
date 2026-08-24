'use strict';

const { SOURCES } = require('../utils/sources');
const { V1_PROVIDER_DEFINITIONS } = require('./v1-provider-definitions');

const V1_SOURCE_KEYS = Object.freeze([
  'ann',
  'animecorner',
  'animetrending',
  'crunchyroll',
]);

const V1_SOURCE_METADATA = Object.freeze({
  ann: Object.freeze({
    sourceDisplayName: 'Anime News Network',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: V1_PROVIDER_DEFINITIONS.ann.articleHosts,
  }),
  animecorner: Object.freeze({
    sourceDisplayName: 'Anime Corner',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: V1_PROVIDER_DEFINITIONS.animecorner.articleHosts,
  }),
  animetrending: Object.freeze({
    sourceDisplayName: 'Anime Trending',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: V1_PROVIDER_DEFINITIONS.animetrending.articleHosts,
  }),
  crunchyroll: Object.freeze({
    sourceDisplayName: 'Crunchyroll',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: V1_PROVIDER_DEFINITIONS.crunchyroll.articleHosts,
  }),
});

function createV1SourceRegistry() {
  return Object.fromEntries(
    V1_SOURCE_KEYS.map((providerKey) => {
      const upstreamSource = SOURCES[providerKey];
      const metadata = V1_SOURCE_METADATA[providerKey];

      if (!upstreamSource || upstreamSource.name !== metadata.sourceDisplayName) {
        throw new Error(`V1 source registry mismatch for ${providerKey}`);
      }

      return [providerKey, {
        providerKey,
        ...metadata,
        fetch: upstreamSource.fetch,
        emptyResultAmbiguous: false,
      }];
    }),
  );
}

module.exports = {
  V1_SOURCE_KEYS,
  V1_SOURCE_METADATA,
  createV1SourceRegistry,
};
