/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/news.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Main news endpoint. Returns paginated, sorted, filtered
 *   articles from all 7 sources with date range filtering,
 *   cursor-based pagination, and cross-source deduplication.
 *
 * @endpoint GET /api/news
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../utils/cacheHandler');
const { CORS_HEADERS, MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_SORT } = require('../utils/constants');
const { SOURCES, SOURCE_KEYS } = require('../utils/sources');

// ══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Cross-source deduplication ----

/**
 * Remove duplicate articles across sources by normalized title.
 *
 * NOTE: Normalization strips punctuation and collapses whitespace
 *       so "Crunchyroll: New Anime!" and "Crunchyroll New Anime"
 *       are treated as the same article.
 *
 * @param {Array} articles - Mixed articles from multiple sources
 * @returns {Array} Deduplicated articles (first occurrence wins)
 */
function deduplicateArticles(articles) {
  const seen = new Map();
  const unique = [];
  for (const article of articles) {
    const key = article.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(article);
    }
  }
  return unique;
}

// ---- FEATURE: Cursor-based pagination ----

/**
 * Encode an offset into an opaque base64url cursor.
 *
 * @param {number} offset - Pagination offset
 * @returns {string} Base64url-encoded cursor string
 */
function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

/**
 * Decode an opaque cursor back to an offset value.
 *
 * @param {string} cursor - Base64url-encoded cursor
 * @returns {number|null} Decoded offset, or null if malformed
 */
function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return decoded.offset;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// SOURCE FETCHER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Parallel source fetching ----

/**
 * Fetch articles from one or all sources in parallel.
 *
 * For each source:
 *   1. Call its fetch function
 *   2. Track success/failure metrics
 *   3. Concatenate results
 *   4. Deduplicate across sources
 *   5. Sort by date (newest first)
 *   6. Normalize tags and fill defaults
 *
 * @param {string} source - Source key ('all' or specific key)
 * @returns {Promise<Array>} Deduplicated, sorted articles
 */
async function fetchFromSources(source) {
  const sourcePromises = [], sourceNames = [];

  if (source === 'all') {
    Object.entries(SOURCES).forEach(([key, config]) => {
      sourcePromises.push(config.fetch().catch(() => []));
      sourceNames.push(key);
    });
  } else if (SOURCES[source]?.fetch) {
    sourcePromises.push(SOURCES[source].fetch().catch(() => []));
    sourceNames.push(source);
  }

  const results = await Promise.allSettled(sourcePromises);
  let allNews = [];

  results.forEach((result, i) => {
    const key = sourceNames[i];
    if (result.status === 'fulfilled') {
      const articles = result.value || [];
      console.log(`[Source] ${key}: ${articles.length} articles`);
      cacheHandler.trackSource(key, { count: articles.length });
      allNews = allNews.concat(articles);
    } else {
      console.error(`[Source] ${key}: FAILED - ${result.reason?.message}`);
      cacheHandler.trackSource(key, { error: result.reason?.message || 'Fetch failed' });
    }
  });

  // Cross-source deduplication
  const before = allNews.length;
  allNews = deduplicateArticles(allNews);
  if (before !== allNews.length) console.log(`[API] Deduplicated: ${before} → ${allNews.length}`);

  // Sort newest first and normalize fields
  allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
  allNews = allNews.map(article => ({
    ...article,
    tags: [...new Set([...(article.tags || []), article.source.toLowerCase().replace(/\s+/g, '-')])],
    excerpt: article.excerpt || '',
    image: article.image || '',
    date: article.date || new Date().toISOString()
  }));

  return allNews;
}

// ══════════════════════════════════════════════════════════════
// RESPONSE BUILDER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Paginated response builder ----

/**
 * Build and send the JSON response with pagination metadata.
 *
 * @param {Object} res - Express response object
 * @param {Array} news - Full article array
 * @param {string} source - Source filter key
 * @param {string} sort - Sort order ('latest' or 'oldest')
 * @param {number} limit - Page size
 * @param {number} offset - Pagination offset
 * @param {number} startTime - Request start timestamp (ms)
 * @param {Date|null} fromDate - Start of date range filter
 * @param {Date|null} toDate - End of date range filter
 */
function sendResponse(res, news, source, sort, limit, offset, startTime, fromDate, toDate) {
  let filtered = [...news];

  // Date range filtering
  if (fromDate) filtered = filtered.filter(a => new Date(a.date) >= fromDate);
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999); // Include entire "to" day
    filtered = filtered.filter(a => new Date(a.date) <= endOfDay);
  }

  // Sort
  if (sort === 'oldest') filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  else filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Paginate
  const total = filtered.length;
  filtered = filtered.slice(offset, offset + limit);
  const responseTime = Date.now() - startTime;
  const hasMore = offset + limit < total;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Response-Time', `${responseTime}ms`);

  res.json({
    success: true,
    data: filtered,
    meta: {
      total,
      returned: filtered.length,
      offset,
      limit,
      hasMore,
      nextCursor: hasMore ? encodeCursor(offset + limit) : null,
      source,
      sort,
      ...(fromDate && { from: fromDate.toISOString().split('T')[0] }),
      ...(toDate && { to: toDate.toISOString().split('T')[0] }),
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      availableSources: SOURCE_KEYS
    }
  });
}

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/news handler ----

/**
 * Main request handler for GET /api/news.
 *
 * Query parameters:
 *   - limit (1-100, default 20)
 *   - offset (>=0, default 0)
 *   - cursor (base64url, takes precedence over offset)
 *   - sort ('latest'|'oldest', default 'latest')
 *   - source ('all'|specific key, default 'all')
 *   - from (YYYY-MM-DD date range start)
 *   - to (YYYY-MM-DD date range end)
 *   - refresh ('true' to bypass cache)
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    // ─── Parse query parameters ───
    const limit = Math.min(Math.max(parseInt(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const sort = req.query.sort === 'oldest' ? 'oldest' : DEFAULT_SORT;
    const source = req.query.source?.toLowerCase() || 'all';
    const forceRefresh = req.query.refresh === 'true';
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    // Cursor takes precedence over offset
    let offset = 0;
    if (req.query.cursor) {
      const decoded = decodeCursor(req.query.cursor);
      if (decoded === null) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cursor',
          message: 'The cursor parameter is malformed or expired.',
          timestamp: new Date().toISOString()
        });
      }
      offset = decoded;
    } else {
      offset = Math.max(parseInt(req.query.offset) || 0, 0);
    }

    // ─── Validate parameters ───
    if (source !== 'all' && !SOURCE_KEYS.includes(source)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid source parameter',
        message: `Available sources: all, ${SOURCE_KEYS.join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }

    if (fromDate && isNaN(fromDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from date', message: 'Use ISO format: YYYY-MM-DD', timestamp: new Date().toISOString() });
    }
    if (toDate && isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid to date', message: 'Use ISO format: YYYY-MM-DD', timestamp: new Date().toISOString() });
    }

    // ─── Cache check ───
    const cacheKey = `news_${source}`;
    if (!forceRefresh) {
      const cached = cacheHandler.get(cacheKey);
      if (cached && cached.length > 0) return sendResponse(res, cached, source, sort, limit, offset, startTime, fromDate, toDate);
    } else {
      cacheHandler.del(cacheKey);
    }

    // ─── Fetch from sources ───
    const allNews = await fetchFromSources(source);
    if (allNews.length === 0) {
      return res.status(503).json({
        success: false,
        error: 'No news available',
        message: 'All sources are currently unavailable.',
        timestamp: new Date().toISOString()
      });
    }

    cacheHandler.set(cacheKey, allNews, 600);
    sendResponse(res, allNews, source, sort, limit, offset, startTime, fromDate, toDate);
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', message: error.message, timestamp: new Date().toISOString() });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/news.js
