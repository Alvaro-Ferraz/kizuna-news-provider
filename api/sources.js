const { CORS_HEADERS } = require('../utils/constants');
const { SOURCES, SOURCE_KEYS } = require('../utils/sources');
const cacheHandler = require('../utils/cacheHandler');

module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const metrics = cacheHandler.getSourceMetrics();

  const sources = SOURCE_KEYS.map(key => {
    const config = SOURCES[key];
    const metric = metrics[key] || {};
    return {
      key,
      name: config.name,
      fetchCount: metric.fetchCount || 0,
      lastFetch: metric.lastFetch || null,
      articleCount: metric.articleCount || 0,
      lastError: metric.lastError || null,
      status: metric.lastError ? 'degraded' : (metric.lastFetch ? 'healthy' : 'unknown')
    };
  });

  const responseTime = Date.now() - startTime;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
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
