/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — sources.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Centralized news source registry. Single source of truth
 *   for all 7 source definitions — eliminates triple
 *   duplication that previously existed across news.js,
 *   search.js, and rss.js.
 *
 * @exports SOURCES, SOURCE_KEYS
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// SOURCE IMPORTS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Fetcher modules ----
const fetchANN = require('./fetchANN');
const fetchAnimeCorner = require('./fetchAnimeCorner');
const fetchMyAnimeList = require('./fetchMyAnimeList');
const fetchOtakuNews = require('./fetchOtakuNews');
const fetchCrunchyroll = require('./fetchCrunchyroll');
const fetchAnimeHerald = require('./fetchAnimeHerald');
const fetchComicBook = require('./fetchComicBook');

// ══════════════════════════════════════════════════════════════
// SOURCE REGISTRY
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Source definitions ----
/**
 * Source registry — maps source keys to display names and fetch functions.
 *
 * NOTE: To add a new source:
 *   1. Create utils/fetchNewSource.js exporting an async fetch function
 *   2. Import it above
 *   3. Add an entry here with key, name, and fetch reference
 *
 * @type {Object.<string, {name: string, fetch: Function}>}
 */
const SOURCES = {
  ann:          { name: 'Anime News Network', fetch: fetchANN },
  animecorner:  { name: 'Anime Corner',       fetch: fetchAnimeCorner },
  myanimelist:  { name: 'MyAnimeList',         fetch: fetchMyAnimeList },
  otakuusa:     { name: 'Otaku USA Magazine',  fetch: fetchOtakuNews },
  crunchyroll:  { name: 'Crunchyroll',         fetch: fetchCrunchyroll },
  animeherald:  { name: 'Anime Herald',        fetch: fetchAnimeHerald },
  comicbook:    { name: 'Comic Book',          fetch: fetchComicBook }
};

/** @type {string[]} Array of valid source keys for validation */
const SOURCE_KEYS = Object.keys(SOURCES);

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = { SOURCES, SOURCE_KEYS };

// ══════════════════════════════════════════════════════════════ END: sources.js
