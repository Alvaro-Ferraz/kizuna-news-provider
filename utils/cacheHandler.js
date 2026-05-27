/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — cacheHandler.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Two-tier cache system: in-memory (node-cache) with
 *   disk fallback for serverless persistence. Also tracks
 *   per-source fetch metrics for the /api/sources endpoint.
 *
 * @exports
 *   get, set, del, flush, getStats,
 *   trackSource, getSourceMetrics, refresh
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Cache TTL and storage paths ----

/** @type {number} Cache time-to-live in seconds (env override) */
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 600;

/**
 * Serverless detection — Vercel and AWS Lambda have read-only
 * filesystems except for /tmp. We store disk cache there
 * to survive across warm function invocations.
 *
 * @type {boolean}
 */
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/** @type {string} Disk cache directory path */
const CACHE_DIR = IS_SERVERLESS ? path.join('/tmp', 'aninews-cache') : path.join(__dirname, '../data');

/** @type {NodeCache} In-memory cache instance */
const cache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 60,    // Expire check every 60 seconds
  useClones: false,    // Return references, not deep clones (performance)
  deleteOnExpire: true
});

// ══════════════════════════════════════════════════════════════
// DIRECTORY INITIALIZATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Cache directory setup ----

/**
 * Create cache directory if it doesn't exist.
 * NOTE: Wrapped in try-catch because this runs at module load time —
 *       on Vercel's read-only filesystem, /tmp is the only writable path.
 */
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[Cache] Could not create cache directory:', e.message);
}

// ══════════════════════════════════════════════════════════════
// CACHE STATISTICS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Hit/miss tracking ----

/** @type {{hits: number, misses: number, lastRefresh: string|null}} */
const stats = {
  hits: 0,
  misses: 0,
  lastRefresh: null
};

// ══════════════════════════════════════════════════════════════
// PER-SOURCE METRICS (disk-persisted)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Source metrics persistence ----

/**
 * Source metrics file path.
 * NOTE: Persisted to disk so /api/sources returns real data
 *       across serverless cold starts (in-memory would reset).
 *
 * @type {string}
 */
const SOURCE_METRICS_FILE = path.join(CACHE_DIR, '_source_metrics.json');

/** @type {Object.<string, {fetchCount: number, lastFetch: string|null, lastError: Object|null, articleCount: number}>} */
let sourceMetrics = {};

/**
 * Load source metrics from disk on module init.
 * Silently falls back to empty object if file doesn't exist.
 */
try {
  if (fs.existsSync(SOURCE_METRICS_FILE)) {
    sourceMetrics = JSON.parse(fs.readFileSync(SOURCE_METRICS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('[Cache] Could not load source metrics:', e.message);
}

// ══════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ══════════════════════════════════════════════════════════════

module.exports = {

  // ---- FEATURE: Cache GET (memory-first, disk fallback) ----

  /**
   * Retrieve a value from cache.
   *
   * Strategy:
   *   1. Check in-memory cache (fastest)
   *   2. Check disk cache file (survives serverless restarts)
   *   3. Return null on miss
   *
   * NOTE: Disk cache files have their own TTL check based on file mtime.
   *       Stale files are auto-deleted on read.
   *
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  get: (key) => {
    try {
      // Tier 1: In-memory (sub-millisecond)
      const memCache = cache.get(key);
      if (memCache) {
        stats.hits++;
        console.log(`[Cache] HIT for key: ${key}`);
        return memCache;
      }

      // Tier 2: Disk fallback (for serverless cold starts)
      const cacheFile = path.join(CACHE_DIR, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        const stat = fs.statSync(cacheFile);
        const age = Date.now() - stat.mtimeMs;
        const maxAge = CACHE_TTL * 1000;

        // Only use if file is still fresh
        if (age < maxAge) {
          const fileData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          cache.set(key, fileData); // Promote to memory cache
          stats.hits++;
          console.log(`[Cache] DISK HIT for key: ${key}`);
          return fileData;
        } else {
          // Delete stale cache file to free disk space
          fs.unlinkSync(cacheFile);
          console.log(`[Cache] DISK EXPIRED for key: ${key}`);
        }
      }

      stats.misses++;
      console.log(`[Cache] MISS for key: ${key}`);
      return null;
    } catch (e) {
      console.error('[Cache] Read error:', e.message);
      return null;
    }
  },

  // ---- FEATURE: Cache SET (memory + disk) ----

  /**
   * Store a value in both memory and disk cache.
   *
   * @param {string} key - Cache key
   * @param {*} data - Value to cache (must be JSON-serializable)
   * @param {number} [ttl=CACHE_TTL] - TTL in seconds (memory only)
   */
  set: (key, data, ttl = CACHE_TTL) => {
    try {
      cache.set(key, data, ttl);
      // Persist to disk for serverless survival
      const cacheFile = path.join(CACHE_DIR, `${key}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
      stats.lastRefresh = new Date().toISOString();
      console.log(`[Cache] SET for key: ${key} (${data.length || data.data?.length || 'object'} items)`);
    } catch (e) {
      console.error('[Cache] Write error:', e.message);
    }
  },

  // ---- FEATURE: Cache DELETE ----

  /**
   * Delete a specific cache key from memory and disk.
   *
   * @param {string} key - Cache key to delete
   */
  del: (key) => {
    cache.del(key);
    try {
      const cacheFile = path.join(CACHE_DIR, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (e) {
      console.error('[Cache] Delete error:', e.message);
    }
  },

  // ---- FEATURE: Cache FLUSH (full reset) ----

  /**
   * Flush all caches — memory, disk files, and source metrics.
   * NOTE: Called by POST /api/cache/clear endpoint.
   */
  flush: () => {
    cache.flushAll();
    try {
      const files = fs.readdirSync(CACHE_DIR);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        }
      });
      console.log('[Cache] Flushed all caches');
    } catch (e) {
      console.error('[Cache] Flush error:', e.message);
    }
    // Reset in-memory metrics
    Object.keys(sourceMetrics).forEach(k => delete sourceMetrics[k]);
  },

  // ---- FEATURE: Cache statistics ----

  /**
   * Get cache hit/miss statistics.
   *
   * @returns {{hits: number, misses: number, lastRefresh: string|null, keys: string[], ttl: number}}
   */
  getStats: () => ({
    ...stats,
    keys: cache.keys(),
    ttl: CACHE_TTL
  }),

  // ---- FEATURE: Source metrics tracking ----

  /**
   * Track a fetch result for a specific news source.
   * Persists to disk so /api/sources works across serverless restarts.
   *
   * @param {string} sourceKey - Source key (e.g. 'ann', 'crunchyroll')
   * @param {{count?: number, error?: string}} options - Fetch result metadata
   */
  trackSource: (sourceKey, { count, error } = {}) => {
    if (!sourceMetrics[sourceKey]) {
      sourceMetrics[sourceKey] = { fetchCount: 0, lastFetch: null, lastError: null, articleCount: 0 };
    }
    const m = sourceMetrics[sourceKey];
    m.fetchCount++;
    m.lastFetch = new Date().toISOString();
    if (error) m.lastError = { message: error, time: m.lastFetch };
    if (count !== undefined) m.articleCount = count;
    try {
      fs.writeFileSync(SOURCE_METRICS_FILE, JSON.stringify(sourceMetrics, null, 2));
    } catch (e) {
      console.warn('[Cache] Could not persist source metrics:', e.message);
    }
  },

  /**
   * Get all source metrics (for /api/sources endpoint).
   *
   * @returns {Object} Source metrics object keyed by source key
   */
  getSourceMetrics: () => ({ ...sourceMetrics }),

  // ---- FEATURE: Force cache refresh ----

  /**
   * Force-refresh a cache key by deleting and re-fetching.
   *
   * @param {Function} fetchFn - Async function that returns fresh data
   * @param {string} key - Cache key to refresh
   * @returns {Promise<*>} Freshly fetched data
   */
  refresh: async (fetchFn, key) => {
    module.exports.del(key);
    const data = await fetchFn();
    module.exports.set(key, data);
    return data;
  }
};

// ══════════════════════════════════════════════════════════════ END: cacheHandler.js
