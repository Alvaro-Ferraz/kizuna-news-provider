/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — server.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Express server entry point. Configures middleware
 *   (CORS, security headers, rate limiting, request IDs),
 *   mounts all API routes, and handles 404/error responses.
 *   Used for local development and Docker deployments.
 *
 * @exports Express app instance
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { APP_NAME, APP_VERSION, CORS_HEADERS, RATE_LIMIT, RATE_WINDOW } = require('./utils/constants');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_CLEAR_KEY = process.env.CACHE_CLEAR_KEY;

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Trust proxy ----
// NOTE: Required for req.ip to return real client IP behind Vercel/CDN
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- FEATURE: Request ID middleware ----
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ---- FEATURE: CORS middleware ----
app.use((req, res, next) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// ---- FEATURE: Security headers ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ══════════════════════════════════════════════════════════════
// IN-MEMORY RATE LIMITER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Rate limiting ----

/** @type {Map<string, {count: number, resetAt: number}>} Per-IP rate buckets */
const rateBuckets = new Map();

/**
 * Extract rate limit key from request.
 * Uses X-Forwarded-For header when behind a proxy.
 *
 * @param {Object} req - Express request
 * @returns {string} Client IP or fallback identifier
 */
function getRateKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
}

/**
 * Check and enforce rate limit for a request.
 * Sets X-RateLimit-* and Retry-After response headers.
 *
 * NOTE: Returns false if rate limit exceeded (caller should
 *       short-circuit). Returns true if request is allowed.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {boolean} Whether the request is allowed
 */
function checkRate(req, res) {
  const key = getRateKey(req);
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  // Reset bucket if window has expired
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW };
    rateBuckets.set(key, bucket);
  }

  bucket.count++;
  const remaining = Math.max(0, RATE_LIMIT - bucket.count);
  const resetSec = Math.ceil((bucket.resetAt - now) / 1000);

  // Always set rate limit headers (even when not exceeded)
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetSec));

  if (bucket.count > RATE_LIMIT) {
    res.setHeader('Retry-After', String(resetSec));
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: `Max ${RATE_LIMIT} requests per minute. Try again in ${resetSec}s.`,
      retryAfter: resetSec
    });
    return false;
  }
  return true;
}

/**
 * Periodic cleanup of stale rate limit buckets.
 * NOTE: Prevents memory leak from accumulating expired entries.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Apply rate limiting to all /api routes
app.use('/api', (req, res, next) => {
  if (!checkRate(req, res)) return;
  next();
});

// ---- FEATURE: Request logging ----
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] [${req.id}] ${req.method} ${req.path}`);
  next();
});

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Route mounting ----
app.get('/api/news', require('./api/news.js'));
app.head('/api/news', require('./api/news.js'));
app.get('/api/news/tags', require('./api/news/tags.js'));
app.head('/api/news/tags', require('./api/news/tags.js'));
app.get('/api/news/:slug', require('./api/news/[slug].js'));
app.head('/api/news/:slug', require('./api/news/[slug].js'));
app.get('/api/search', require('./api/search.js'));
app.head('/api/search', require('./api/search.js'));
app.get('/api/rss', require('./api/rss.js'));
app.head('/api/rss', require('./api/rss.js'));
app.get('/api/health', require('./api/health.js'));
app.head('/api/health', require('./api/health.js'));
app.get('/api/stats', require('./api/stats.js'));
app.head('/api/stats', require('./api/stats.js'));
app.get('/api/stream', require('./api/stream.js'));
app.get('/api/openapi', require('./api/openapi.js'));
app.get('/api/sources', require('./api/sources.js'));
app.head('/api/sources', require('./api/sources.js'));

// ---- FEATURE: Cache clear with API key auth ----
app.post('/api/cache/clear', (req, res, next) => {
  // NOTE: Only enforced when CACHE_CLEAR_KEY env var is set
  if (CACHE_CLEAR_KEY && req.headers['x-api-key'] !== CACHE_CLEAR_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }
  next();
}, require('./api/cache/clear.js'));

// ══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: 404 handler ----
app.use((req, res) => {
  const accept = req.headers.accept || '';

  if (accept.includes('text/html')) {
    // Styled HTML 404 for browser requests
    res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — AniNewsAPI</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Space Grotesk',system-ui,sans-serif;background:#0a0a0f;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}a{color:#a78bfa;text-decoration:none}a:hover{text-decoration:underline}.code{font-size:6rem;font-weight:700;background:linear-gradient(135deg,#a78bfa,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:16px}p{color:#94a3b8;margin-bottom:24px;font-size:1.1rem}pre{background:#161622;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 20px;font-size:0.85rem;color:#94a3b8;text-align:left;max-width:500px;margin:0 auto;overflow-x:auto}</style></head><body><div><div class="code">404</div><p>This endpoint doesn't exist. Try the API instead:</p><pre><code>curl https://aninews.vercel.app/api/news</code></pre><br><a href="/">&larr; Back to AniNewsAPI</a></div></body></html>`);
  } else {
    // JSON 404 for API clients
    res.status(404).json({
      success: false,
      error: 'Not found',
      availableEndpoints: [
        'GET /api/news',
        'GET /api/news/tags',
        'GET /api/news/:slug',
        'GET /api/search?q=',
        'GET /api/sources',
        'GET /api/rss',
        'GET /api/health',
        'GET /api/stats',
        'GET /api/stream',
        'GET /api/openapi',
        'POST /api/cache/clear'
      ]
    });
  }
});

// ---- FEATURE: Global error handler ----
app.use((err, req, res, _next) => {
  console.error(`[Server Error] [${req?.id}]:`, err);
  res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
});

// ══════════════════════════════════════════════════════════════
// SERVER START & GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Startup banner ----
const server = app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════════════════╗\n║           🎌 ${APP_NAME} v${APP_VERSION} 🎌\n║   Server running on http://localhost:${PORT}\n║\n║   Endpoints:\n║   • GET /api/news, /api/search, /api/rss\n║   • GET /api/news/tags, /api/news/:slug\n║   • GET /api/health, /api/stats, /api/stream\n║   • GET /api/openapi, /api/sources\n║   • POST /api/cache/clear\n╚════════════════════════════════════════════════════════════╝\n`);
});

// ---- FEATURE: Graceful shutdown ----
function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] Closed all connections.');
    process.exit(0);
  });
  // Force close after 10s
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;

// ══════════════════════════════════════════════════════════════ END: server.js
