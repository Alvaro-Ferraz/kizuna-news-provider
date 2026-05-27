/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/stats.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Cache statistics endpoint. Returns hit/miss counts,
 *   hit rate percentage, active cache keys, and TTL.
 *   Useful for monitoring cache effectiveness.
 *
 * @endpoint GET /api/stats
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../utils/cacheHandler');
const { CORS_HEADERS } = require('../utils/constants');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/stats handler ----

/**
 * Main request handler for GET /api/stats.
 *
 * Returns:
 *   - hits: Total cache hits
 *   - misses: Total cache misses
 *   - hitRate: Hit percentage (e.g. "85.50%")
 *   - totalRequests: hits + misses
 *   - keys: Active cache key names
 *   - ttl: Cache TTL in seconds
 *   - lastRefresh: ISO timestamp of last cache write
 */
module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const stats = cacheHandler.getStats();
    const total = stats.hits + stats.misses;
    const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(2) : '0.00';

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');

    res.json({
      success: true,
      data: {
        ...stats,
        hitRate: `${hitRate}%`,
        totalRequests: total
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/stats.js
