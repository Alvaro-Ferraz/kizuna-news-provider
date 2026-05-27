/**
 * Centralized news source registry
 * Single source of truth for all source definitions
 */
const fetchANN = require('./fetchANN');
const fetchAnimeCorner = require('./fetchAnimeCorner');
const fetchMyAnimeList = require('./fetchMyAnimeList');
const fetchOtakuNews = require('./fetchOtakuNews');
const fetchCrunchyroll = require('./fetchCrunchyroll');
const fetchAnimeHerald = require('./fetchAnimeHerald');
const fetchComicBook = require('./fetchComicBook');

const SOURCES = {
  ann: { name: 'Anime News Network', fetch: fetchANN },
  animecorner: { name: 'Anime Corner', fetch: fetchAnimeCorner },
  myanimelist: { name: 'MyAnimeList', fetch: fetchMyAnimeList },
  otakuusa: { name: 'Otaku USA Magazine', fetch: fetchOtakuNews },
  crunchyroll: { name: 'Crunchyroll', fetch: fetchCrunchyroll },
  animeherald: { name: 'Anime Herald', fetch: fetchAnimeHerald },
  comicbook: { name: 'Comic Book', fetch: fetchComicBook }
};

const SOURCE_KEYS = Object.keys(SOURCES);

module.exports = { SOURCES, SOURCE_KEYS };
