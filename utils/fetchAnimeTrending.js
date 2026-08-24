/*
 * AniNewsAPI — fetchAnimeTrending.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 * Original author: Shinei Nouzen. License: MIT.
 * Kizuna fork: canonical direct, bounded RSS discovery only.
 */

'use strict';

const { createRssProvider } = require('../src/rss-provider');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');

const definition = V1_PROVIDER_DEFINITIONS.animetrending;
let provider;

function fetchAnimeTrending() {
  if (!provider) provider = createRssProvider(definition);
  return provider.fetch();
}

fetchAnimeTrending.createProvider = (dependencies) => createRssProvider(definition, dependencies);
fetchAnimeTrending.definition = definition;

module.exports = fetchAnimeTrending;
