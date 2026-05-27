/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/cache/clear.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Cache clear endpoint. Supports clearing a specific cache
 *   key (via request body) or flushing all caches. Protected
 *   by API key authentication when CACHE_CLEAR_KEY is set.
 *
 * @endpoint POST /api/cache/clear
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../../utils/cacheHandler');
const { CORS_HEADERS } = require('../../utils/constants');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: POST /api/cache/clear handler ----

/**
 * Main request handler for POST /api/cache/clear.
 *
 * Body parameters:
 *   - key (optional) - Specific cache key to clear.
 *                      If omitted, flushes ALL caches.
 *
 * NOTE: Authentication is handled by middleware in server.js
 *       which checks X-Api-Key header against CACHE_CLEAR_KEY env.
 */
module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    // Only POST is allowed (enforced by middleware in server.js)
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        message: 'Only POST requests are allowed'
      });
    }

    const { key } = req.body || {};

    if (key) {
      // ─── Clear specific cache key ───
      cacheHandler.del(key);
      res.json({
        success: true,
        message: `Cache key '${key}' cleared`,
        timestamp: new Date().toISOString()
      });
    } else {
      // ─── Flush all caches ───
      cacheHandler.flush();
      res.json({
        success: true,
        message: 'All caches cleared',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/cache/clear.js
