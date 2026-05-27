/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/sources.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Per-source health and statistics endpoint. Performs
 *   real-time fetches against each source to determine
 *   health status, article count, and latency. Results
 *   are tracked in cacheHandler for persistence.
 *
 * @endpoint GET /api/sources
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const { CORS_HEADERS } = require('../utils/constants');
const { SOURCES, SOURCE_KEYS } = require('../utils/sources');
const cacheHandler = require('../utils/cacheHandler');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/sources handler ----

/**
 * Main request handler for GET /api/sources.
 *
 * Runs lightweight health checks for all 7 sources in parallel.
 * Each source is fetched to measure:
 *   - Health status (healthy / degraded)
 *   - Article count
 *   - Fetch latency (ms)
 *   - Last fetch timestamp
 *   - Last error (if any)
 *
 * NOTE: This endpoint triggers actual fetches, so it's heavier
 *       than a typical health check. Cache for 2 minutes.
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ─── Load persisted metrics for fallback data ───
  const diskMetrics = cacheHandler.getSourceMetrics();
  const hasDiskData = Object.keys(diskMetrics).length > 0;

  // ─── Run parallel health checks ───
  const results = await Promise.allSettled(
    SOURCE_KEYS.map(async key => {
      const config = SOURCES[key];
      const metric = diskMetrics[key] || {};
      const fetchStart = Date.now();

      try {
        const articles = await config.fetch();
        const latency = Date.now() - fetchStart;
        cacheHandler.trackSource(key, { count: articles.length });

        return {
          key,
          name: config.name,
          status: 'healthy',
          articleCount: articles.length,
          latency: `${latency}ms`,
          lastFetch: new Date().toISOString(),
          lastError: null
        };
      } catch (error) {
        const latency = Date.now() - fetchStart;
        cacheHandler.trackSource(key, { error: error.message });

        return {
          key,
          name: config.name,
          status: 'degraded',
          articleCount: metric.articleCount || 0,
          latency: `${latency}ms`,
          lastFetch: metric.lastFetch || null,
          lastError: { message: error.message, time: new Date().toISOString() }
        };
      }
    })
  );

  // ─── Map results (handle rejected promises) ───
  const sources = results.map(r => r.status === 'fulfilled' ? r.value : {
    key: 'unknown',
    name: 'Unknown',
    status: 'error',
    articleCount: 0,
    latency: '0ms',
    lastFetch: null,
    lastError: { message: r.reason?.message || 'Unknown error', time: new Date().toISOString() }
  });

  const responseTime = Date.now() - startTime;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.setHeader('X-Response-Time', `${responseTime}ms`);

  res.json({
    success: true,
    data: sources,
    meta: {
      total: sources.length,
      healthy: sources.filter(s => s.status === 'healthy').length,
      degraded: sources.filter(s => s.status === 'degraded').length,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    }
  });
};

// ══════════════════════════════════════════════════════════════ END: api/sources.js
