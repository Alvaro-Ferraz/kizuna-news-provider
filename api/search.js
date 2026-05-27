/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/search.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Full-text search endpoint with relevance scoring.
 *   Searches across titles, excerpts, sources, and tags.
 *   Results are ranked by keyword density in title (10pts)
 *   vs excerpt (3pts), then sorted by date.
 *
 * @endpoint GET /api/search
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../utils/cacheHandler');
const { CORS_HEADERS, MAX_LIMIT, DEFAULT_LIMIT } = require('../utils/constants');
const { SOURCES } = require('../utils/sources');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/search handler ----

/**
 * Main request handler for GET /api/search.
 *
 * Query parameters:
 *   - q (required, min 2 chars) - Search query
 *   - source (optional) - Source key filter
 *   - limit (1-100, default 20) - Page size
 *   - offset (>=0, default 0) - Pagination offset
 *   - from (YYYY-MM-DD) - Date range start
 *   - to (YYYY-MM-DD) - Date range end
 *
 * Scoring algorithm:
 *   - Title match: +10 points per search term
 *   - Excerpt match: +3 points per search term
 *   - Tiebreaker: newest date first
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const query = req.query.q?.trim();
    const source = req.query.source?.toLowerCase() || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    // ─── Validate query ───
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid query parameter',
        message: 'Please provide a search query with at least 2 characters using ?q=your+query',
        timestamp: new Date().toISOString()
      });
    }

    // ─── Fetch articles (from cache or sources) ───
    const cacheKey = `news_${source}`;
    let articles = cacheHandler.get(cacheKey);

    if (!articles || articles.length === 0) {
      const fetchPromises = [];
      if (source === 'all') {
        Object.entries(SOURCES).forEach(([key, config]) => {
          fetchPromises.push(config.fetch().catch(() => []));
        });
      } else if (SOURCES[source]?.fetch) {
        fetchPromises.push(SOURCES[source].fetch().catch(() => []));
      }
      const results = await Promise.allSettled(fetchPromises);
      articles = [];
      results.forEach(r => {
        if (r.status === 'fulfilled') articles = articles.concat(r.value || []);
      });
      if (articles.length > 0) cacheHandler.set(cacheKey, articles, 600);
    }

    // ─── Full-text search with relevance scoring ───

    const lowerQuery = query.toLowerCase();
    const searchTerms = lowerQuery.split(/\s+/).filter(t => t.length > 1);

    // Filter: every search term must appear somewhere in the article
    let results = articles.filter(article => {
      const searchable = `${article.title || ''} ${article.excerpt || ''} ${article.source || ''} ${(article.tags || []).join(' ')}`.toLowerCase();
      return searchTerms.every(term => searchable.includes(term));
    });

    // Score: title matches worth more than excerpt matches
    results = results.map(article => {
      let score = 0;
      const title = (article.title || '').toLowerCase();
      const excerpt = (article.excerpt || '').toLowerCase();
      searchTerms.forEach(term => {
        if (title.includes(term)) score += 10;
        if (excerpt.includes(term)) score += 3;
      });
      return { ...article, _score: score };
    });

    // ─── Date range filtering ───
    if (fromDate && !isNaN(fromDate.getTime())) {
      results = results.filter(a => new Date(a.date) >= fromDate);
    }
    if (toDate && !isNaN(toDate.getTime())) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      results = results.filter(a => new Date(a.date) <= endOfDay);
    }

    // Sort by relevance score (desc), then by date (newest first)
    results.sort((a, b) => b._score !== a._score ? b._score - a._score : new Date(b.date) - new Date(a.date));

    // ─── Paginate ───
    const total = results.length;
    const paginated = results.slice(offset, offset + limit).map(({ _score, ...a }) => a);
    const responseTime = Date.now() - startTime;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Response-Time', `${responseTime}ms`);

    res.json({
      success: true,
      data: paginated,
      meta: {
        query,
        total,
        returned: paginated.length,
        offset,
        limit,
        hasMore: offset + limit < total,
        source,
        ...(fromDate && { from: fromDate.toISOString().split('T')[0] }),
        ...(toDate && { to: toDate.toISOString().split('T')[0] }),
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Search API] Error:', error);
    res.status(500).json({ success: false, error: 'Search failed', message: error.message, timestamp: new Date().toISOString() });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/search.js
