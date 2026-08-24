/*
 * AniNewsAPI — fetchCrunchyroll.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 * Original author: Shinei Nouzen. License: MIT.
 * Kizuna fork: pt-BR direct RSS with bounded en-US fallback.
 */

'use strict';

const { createRssProvider } = require('../src/rss-provider');
const { V1_PROVIDER_DEFINITIONS } = require('../src/v1-provider-definitions');

const definition = V1_PROVIDER_DEFINITIONS.crunchyroll;
let provider;

function fetchCrunchyroll() {
  if (!provider) provider = createRssProvider(definition);
  return provider.fetch();
}

fetchCrunchyroll.createProvider = (dependencies) => createRssProvider(definition, dependencies);
fetchCrunchyroll.definition = definition;

module.exports = fetchCrunchyroll;
