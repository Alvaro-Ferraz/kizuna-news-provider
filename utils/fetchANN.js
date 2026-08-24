/*
 * AniNewsAPI — fetchANN.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 * Original author: Shinei Nouzen. License: MIT.
 * Kizuna fork: direct, bounded RSS discovery only.
 */

'use strict';

const { createRssProvider } = require('../src/rss-provider');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');

const definition = V1_PROVIDER_DEFINITIONS.ann;
let provider;

function fetchANN() {
  if (!provider) provider = createRssProvider(definition);
  return provider.fetch();
}

fetchANN.createProvider = (dependencies) => createRssProvider(definition, dependencies);
fetchANN.definition = definition;

module.exports = fetchANN;
