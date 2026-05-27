const cacheHandler = require('../utils/cacheHandler');
const { CORS_HEADERS, MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_SORT } = require('../utils/constants');
const { SOURCES, SOURCE_KEYS } = require('../utils/sources');

function deduplicateArticles(articles) {
  const seen = new Map();
  const unique = [];
  for (const article of articles) {
    const key = article.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) { seen.set(key, true); unique.push(article); }
  }
  return unique;
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return decoded.offset;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
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
        return res.status(400).json({ success: false, error: 'Invalid cursor', message: 'The cursor parameter is malformed or expired.', timestamp: new Date().toISOString() });
      }
      offset = decoded;
    } else {
      offset = Math.max(parseInt(req.query.offset) || 0, 0);
    }

    if (source !== 'all' && !SOURCE_KEYS.includes(source)) {
      return res.status(400).json({ success: false, error: 'Invalid source parameter', message: `Available sources: all, ${SOURCE_KEYS.join(', ')}`, timestamp: new Date().toISOString() });
    }

    if (fromDate && isNaN(fromDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid from date', message: 'Use ISO format: YYYY-MM-DD', timestamp: new Date().toISOString() });
    }
    if (toDate && isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid to date', message: 'Use ISO format: YYYY-MM-DD', timestamp: new Date().toISOString() });
    }

    const cacheKey = `news_${source}`;
    if (!forceRefresh) {
      const cached = cacheHandler.get(cacheKey);
      if (cached && cached.length > 0) return sendResponse(res, cached, source, sort, limit, offset, startTime, fromDate, toDate);
    } else {
      cacheHandler.del(cacheKey);
    }

    const allNews = await fetchFromSources(source);
    if (allNews.length === 0) {
      return res.status(503).json({ success: false, error: 'No news available', message: 'All sources are currently unavailable.', timestamp: new Date().toISOString() });
    }
    cacheHandler.set(cacheKey, allNews, 600);
    sendResponse(res, allNews, source, sort, limit, offset, startTime, fromDate, toDate);
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', message: error.message, timestamp: new Date().toISOString() });
  }
};

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

  const before = allNews.length;
  allNews = deduplicateArticles(allNews);
  if (before !== allNews.length) console.log(`[API] Deduplicated: ${before} → ${allNews.length}`);

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

function sendResponse(res, news, source, sort, limit, offset, startTime, fromDate, toDate) {
  let filtered = [...news];

  // Date range filtering
  if (fromDate) filtered = filtered.filter(a => new Date(a.date) >= fromDate);
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);
    filtered = filtered.filter(a => new Date(a.date) <= endOfDay);
  }

  if (sort === 'oldest') filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  else filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = filtered.length;
  filtered = filtered.slice(offset, offset + limit);
  const responseTime = Date.now() - startTime;
  const hasMore = offset + limit < total;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Response-Time', `${responseTime}ms`);
  res.json({
    success: true, data: filtered,
    meta: {
      total, returned: filtered.length, offset, limit, hasMore,
      nextCursor: hasMore ? encodeCursor(offset + limit) : null,
      source, sort, ...(fromDate && { from: fromDate.toISOString().split('T')[0] }), ...(toDate && { to: toDate.toISOString().split('T')[0] }),
      responseTime: `${responseTime}ms`, timestamp: new Date().toISOString(), availableSources: SOURCE_KEYS
    }
  });
}
