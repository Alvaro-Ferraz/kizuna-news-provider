/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/news/tags.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Tag listing and filtering endpoint. Without a ?tag=
 *   parameter, returns all tags with article counts. With
 *   ?tag=, filters articles by that tag.
 *
 * @endpoint GET /api/news/tags
 *
 * @version 5.0.0
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../../utils/cacheHandler');
const { CORS_HEADERS, CACHE_KEYS } = require('../../utils/constants');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/news/tags handler ----

/**
 * Main request handler for GET /api/news/tags.
 *
 * Two modes:
 *   - No ?tag=: Returns tag listing with article counts, sorted by popularity
 *   - With ?tag=: Returns articles matching that tag, optionally filtered by source
 *
 * Query parameters:
 *   - tag (optional) - Tag name to filter by
 *   - source (optional) - Source key to further filter results
 */
module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // HEAD requests return headers only
  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).end();
  }

  try {
    const { tag, source } = req.query;
    const cachedNews = cacheHandler.get(CACHE_KEYS.ALL) || [];

    // ─── Mode 1: Tag listing (no ?tag= parameter) ───

    if (!tag) {
      // Count articles per tag using a Map for O(n) aggregation
      const tagCounts = new Map();
      cachedNews.forEach(article => {
        (article.tags || []).forEach(t => {
          const n = t.toLowerCase();
          tagCounts.set(n, (tagCounts.get(n) || 0) + 1);
        });
      });

      // Convert to sorted array (most popular first)
      const tags = Array.from(tagCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      return res.json({
        success: true,
        data: { tags, totalTags: tags.length, totalArticles: cachedNews.length },
        meta: { timestamp: new Date().toISOString() }
      });
    }

    // ─── Mode 2: Filter articles by tag ───

    const normalizedTag = tag.toLowerCase().trim();
    let filtered = cachedNews.filter(a => a.tags?.some(t => t.toLowerCase() === normalizedTag));

    // Optional source filter
    if (source && source !== 'all') {
      filtered = filtered.filter(a => a.source.toLowerCase().replace(/\s+/g, '-') === source.toLowerCase());
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      success: true,
      data: filtered,
      meta: {
        total: filtered.length,
        tag: normalizedTag,
        source: source || 'all',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Tags API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to filter by tag', message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/news/tags.js
