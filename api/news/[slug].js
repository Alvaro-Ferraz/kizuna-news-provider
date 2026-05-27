/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/news/[slug].js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Full article content endpoint. Resolves an article by its
 *   slug, fetches full content from the original URL using the
 *   content parser, and caches the result for 1 hour.
 *
 * @endpoint GET /api/news/:slug
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../../utils/cacheHandler');
const contentParser = require('../../utils/contentParser');
const { CORS_HEADERS } = require('../../utils/constants');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/news/:slug handler ----

/**
 * Main request handler for GET /api/news/:slug.
 *
 * Strategy:
 *   1. Search news_all cache for matching slug
 *   2. If not found, search per-source caches
 *   3. Check content cache (article-content-{slug})
 *   4. Parse full content from original URL
 *   5. Cache parsed content for 1 hour
 *
 * @param {Object} req - Express request (req.query.slug from Vercel rewrite)
 * @param {Object} res - Express response
 */
module.exports = async (req, res) => {
  const { slug } = req.query;
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ─── Validate slug parameter ───
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Missing slug parameter' });
  }

  try {
    // ─── Search cached articles for matching slug ───

    // Try combined cache first
    const cachedNews = cacheHandler.get('news_all') || [];
    let article = cachedNews.find(a => a.slug === slug);

    // Fallback: search individual source caches
    if (!article) {
      for (const src of ['ann', 'animecorner', 'myanimelist', 'otakuusa', 'crunchyroll', 'animeherald', 'comicbook']) {
        article = (cacheHandler.get(`news_${src}`) || []).find(a => a.slug === slug);
        if (article) break;
      }
    }

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found',
        message: `No article found with slug: ${slug}`
      });
    }

    // ─── Check content cache ───

    const contentCacheKey = `article-content-${slug}`;
    const cachedContent = cacheHandler.get(contentCacheKey);
    if (cachedContent) {
      return res.json({
        success: true,
        data: { ...article, ...cachedContent },
        meta: { cached: true, timestamp: new Date().toISOString() }
      });
    }

    // ─── Parse full content from original URL ───

    const fullContent = await contentParser.parseContent(article.link);
    cacheHandler.set(contentCacheKey, fullContent, 3600); // Cache for 1 hour

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.json({
      success: true,
      data: { ...article, ...fullContent },
      meta: { cached: false, timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('[Slug API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch article content', message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/news/[slug].js
