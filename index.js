/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — index.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Vercel serverless entry point. Serves the landing page
 *   (cached in memory) for HTML requests, or returns the
 *   API index JSON for API clients. The landing page is
 *   only re-read from disk when the file's mtime changes.
 *
 * @exports Vercel serverless function handler
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const fs = require('fs');
const path = require('path');
const { APP_NAME, APP_VERSION, APP_DESCRIPTION } = require('./utils/constants');
const { creatorInfo } = require('./utils/creatorInfo');

// ══════════════════════════════════════════════════════════════
// IN-MEMORY LANDING PAGE CACHE
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Landing page memory cache ----

/**
 * Cached HTML content and its file modification time.
 * NOTE: Avoids disk read on every request — only re-reads
 *       when the file's mtime changes (hot reload in dev).
 *
 * @type {string|null}
 */
let cachedHtml = null;

/** @type {number} Last known mtimeMs of index.html */
let cachedHtmlMtime = 0;

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Vercel serverless handler ----

/**
 * Vercel serverless function handler.
 *
 * Behavior:
 *   - HTML request (Accept: text/html or /) → serve cached landing page
 *   - API request (Accept: application/json) → return API index JSON
 *
 * @param {Object} req - Vercel request object
 * @param {Object} res - Vercel response object
 */
module.exports = (req, res) => {
  try {
    const accept = req.headers.accept || '';

    // ─── Landing page (cached in memory) ───
    if (accept.includes('text/html') || req.url === '/' || req.url === '') {
      const filePath = path.join(__dirname, 'public', 'index.html');
      const stat = fs.statSync(filePath);

      // Re-read only if file changed (hot reload support)
      if (!cachedHtml || stat.mtimeMs !== cachedHtmlMtime) {
        cachedHtml = fs.readFileSync(filePath, 'utf8');
        cachedHtmlMtime = stat.mtimeMs;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).send(cachedHtml);
    }

    // ─── API index (JSON) ───
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=300');

    res.status(200).json({
      name: APP_NAME,
      version: APP_VERSION,
      description: APP_DESCRIPTION,
      documentation: 'https://aninews.vercel.app',
      openapi: 'https://aninews.vercel.app/api/openapi',
      endpoints: {
        'GET /api/news': 'Latest anime news with pagination, sorting, source filtering',
        'GET /api/news/tags': 'Tag listing with counts, or filter by tag',
        'GET /api/news/:slug': 'Full article content extraction',
        'GET /api/search': 'Full-text search with relevance scoring',
        'GET /api/sources': 'Source health & stats per source',
        'GET /api/rss': 'RSS 2.0 XML feed',
        'GET /api/health': 'Health check',
        'GET /api/stats': 'Cache statistics',
        'GET /api/stream': 'SSE initial burst',
        'GET /api/openapi': 'OpenAPI 3.0.3 spec',
        'POST /api/cache/clear': 'Flush cache'
      },
      sources: [
        'Anime News Network',
        'Anime Corner',
        'MyAnimeList',
        'Otaku USA Magazine',
        'Crunchyroll',
        'Anime Herald',
        'Comic Book',
        'Tokyo Otaku Mode',
        'Anime Trending',
        'Anime UK News',
        'Random Curiosity',
        "Honey's Anime",
        'Otaku News'
      ],
      creator: creatorInfo.creator,
      github: creatorInfo.github,
      telegram: creatorInfo.telegram,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════ END: index.js
