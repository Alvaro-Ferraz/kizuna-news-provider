'use strict';

const { SOURCES } = require('../utils/sources');

const V1_SOURCE_KEYS = Object.freeze([
  'ann',
  'animecorner',
  'animetrending',
  'crunchyroll',
]);

const V1_SOURCE_METADATA = Object.freeze({
  ann: Object.freeze({
    sourceDisplayName: 'Anime News Network',
    discoveryMethod: 'GOOGLE_NEWS_RSS',
    allowedSourceHosts: Object.freeze([
      'news.google.com',
      'animenewsnetwork.com',
      'www.animenewsnetwork.com',
    ]),
  }),
  animecorner: Object.freeze({
    sourceDisplayName: 'Anime Corner',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: Object.freeze(['animecorner.me', 'www.animecorner.me']),
  }),
  animetrending: Object.freeze({
    sourceDisplayName: 'Anime Trending',
    discoveryMethod: 'DIRECT_RSS',
    allowedSourceHosts: Object.freeze(['anitrendz.net', 'www.anitrendz.net']),
  }),
  crunchyroll: Object.freeze({
    sourceDisplayName: 'Crunchyroll',
    discoveryMethod: 'GOOGLE_NEWS_RSS',
    allowedSourceHosts: Object.freeze([
      'news.google.com',
      'crunchyroll.com',
      'www.crunchyroll.com',
    ]),
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
        emptyResultAmbiguous: true,
      }];
    }),
  );
}

module.exports = {
  V1_SOURCE_KEYS,
  V1_SOURCE_METADATA,
  createV1SourceRegistry,
};
