/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/health.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Health check endpoint. Returns API status, version,
 *   uptime, Node.js version, and cache statistics.
 *   Used by monitoring services and uptime checkers.
 *
 * @endpoint GET /api/health
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../utils/cacheHandler');
const { APP_NAME, APP_VERSION, CORS_HEADERS } = require('../utils/constants');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/health handler ----

/**
 * Main request handler for GET /api/health.
 *
 * Returns:
 *   - status: 'healthy' or 'unhealthy'
 *   - name: Application name
 *   - version: Current version
 *   - uptime: Process uptime in seconds
 *   - cache: Hit/miss statistics
 *   - node: Node.js version string
 */
module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const stats = cacheHandler.getStats();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');

    res.json({
      success: true,
      status: 'healthy',
      name: APP_NAME,
      version: APP_VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      cache: { ...stats, ttl: undefined },
      node: process.version
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/health.js
