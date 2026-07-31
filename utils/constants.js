/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — constants.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Centralized application constants. Every tunable value,
 *   default, and shared string lives here — no magic numbers
 *   scattered across the codebase.
 *
 * @exports
 *   APP_NAME, APP_VERSION, APP_DESCRIPTION,
 *   CACHE_TTL, CACHE_KEYS, MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_SORT,
 *   USER_AGENT, REQUEST_TIMEOUT, CONTENT_TIMEOUT,
 *   MAX_ARTICLES_PER_SOURCE, CORS_HEADERS, RATE_LIMIT, RATE_WINDOW
 *
 * @version 5.0.0
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// APPLICATION IDENTITY
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: App metadata ----
module.exports = {
  /** @type {string} Application display name */
  APP_NAME: 'AniNewsAPI',

  /** @type {string} Semantic version — keep in sync with package.json */
  APP_VERSION: '5.0.0',

  /** @type {string} Short description for API index and OpenAPI spec */
  APP_DESCRIPTION: 'Powerful multi-source anime news API',

  // ══════════════════════════════════════════════════════════════
  // CACHE & LIMITS
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: Cache configuration ----
  /**
   * Default cache TTL in seconds.
   * NOTE: Overridden by CACHE_TTL env var at runtime.
   * @type {number}
   */
  CACHE_TTL: parseInt(process.env.CACHE_TTL) || 600,

  /**
   * Centralized cache key constants.
   * Eliminates hardcoded 'news_all', 'news_ann', etc. across files.
   * @type {Object.<string, string>}
   */
  CACHE_KEYS: {
    ALL: 'news_all',
    ANN: 'news_ann',
    ANIMECORNER: 'news_animecorner',
    MYANIMELIST: 'news_myanimelist',
    OTAKUSA: 'news_otakuusa',
    CRUNCHYROLL: 'news_crunchyroll',
    ANIMEHERALD: 'news_animeherald',
    COMICBOOK: 'news_comicbook',
    ARTICLE_PREFIX: 'article-content-'
  },

  /** @type {number} Maximum articles a client can request per page */
  MAX_LIMIT: 100,

  /** @type {number} Default page size when client omits ?limit= */
  DEFAULT_LIMIT: 20,

  /** @type {string} Default sort order for /api/news */
  DEFAULT_SORT: 'latest',

  // ══════════════════════════════════════════════════════════════
  // NETWORKING
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: HTTP client settings ----
  /**
   * Browser-like User-Agent for web scraping.
   * NOTE: Some sources block requests without a real UA string.
   * @type {string}
   */
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

  /** @type {number} Timeout (ms) for RSS and lightweight fetches */
  REQUEST_TIMEOUT: 15000,

  /** @type {number} Timeout (ms) for full-article content extraction */
  CONTENT_TIMEOUT: 20000,

  /** @type {number} Cap per source to prevent runaway fetches */
  MAX_ARTICLES_PER_SOURCE: 15,

  // ══════════════════════════════════════════════════════════════
  // CORS & RATE LIMITING
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: CORS headers ----
  /**
   * Shared CORS headers applied to every API response.
   * NOTE: Also duplicated in vercel.json for edge middleware.
   * @type {Object.<string, string>}
   */
  CORS_HEADERS: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key, X-Request-Id, If-None-Match'
  },

  // ---- FEATURE: Rate limiting ----
  /** @type {number} Max requests per window */
  RATE_LIMIT: parseInt(process.env.RATE_LIMIT) || 100,

  /** @type {number} Window duration in milliseconds (1 minute) */
  RATE_WINDOW: 60 * 1000
};

// ══════════════════════════════════════════════════════════════ END: constants.js
