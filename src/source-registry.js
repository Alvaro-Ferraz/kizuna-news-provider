'use strict';

const fetchANN = require('../utils/fetchANN');
const fetchAnimeCorner = require('../utils/fetchAnimeCorner');
const fetchAnimeTrending = require('../utils/fetchAnimeTrending');
const fetchCrunchyroll = require('../utils/fetchCrunchyroll');
const { V1_PROVIDER_DEFINITIONS } = require('./v1-provider-definitions');

const V1_FETCHERS = Object.freeze({
  ann: fetchANN,
  animecorner: fetchAnimeCorner,
  animetrending: fetchAnimeTrending,
  crunchyroll: fetchCrunchyroll,
});

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
      const metadata = V1_SOURCE_METADATA[providerKey];
      const provider = V1_FETCHERS[providerKey].createProvider();

      return [providerKey, {
        providerKey,
        ...metadata,
        fetch: () => provider.fetch(),
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
