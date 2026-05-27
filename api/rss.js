/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/rss.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   RSS 2.0 feed generator. Produces standards-compliant XML
 *   with Atom self-link, media:thumbnail, and per-item source
 *   attribution. Supports source filtering.
 *
 * @endpoint GET /api/rss
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('../utils/cacheHandler');
const { APP_NAME, APP_VERSION, CORS_HEADERS, MAX_LIMIT, DEFAULT_LIMIT } = require('../utils/constants');
const { SOURCES } = require('../utils/sources');

// ══════════════════════════════════════════════════════════════
// XML UTILITIES
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: XML escaping ----

/**
 * Escape special XML characters in a string.
 *
 * @param {string} str - Raw string
 * @returns {string} XML-safe string
 */
function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ══════════════════════════════════════════════════════════════
// RSS GENERATOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: RSS 2.0 XML generation ----

/**
 * Generate a standards-compliant RSS 2.0 XML feed.
 *
 * Includes:
 *   - Atom self-link for feed discovery
 *   - media:thumbnail for article images
 *   - Per-item <source> with API URL for attribution
 *   - Category tags per item
 *
 * @param {Array} articles - Sorted article array
 * @param {string} source - Source filter key ('all' or specific)
 * @returns {string} Complete RSS 2.0 XML document
 */
function generateRSS(articles, source) {
  const now = new Date().toUTCString();
  const sourceLabel = source === 'all' ? 'All Sources' : SOURCES[source]?.name || source;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(APP_NAME)} - ${escapeXml(sourceLabel)}</title>
    <description>Latest anime news from ${escapeXml(sourceLabel)}</description>
    <link>https://aninews.vercel.app</link>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>${APP_NAME} v${APP_VERSION}</generator>
`;

  for (const a of articles) {
    const pubDate = new Date(a.date).toUTCString();
    const cats = (a.tags || []).map(t => `      <category>${escapeXml(t)}</category>`).join('\n');

    xml += `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.link)}</link>
      <description>${escapeXml(a.excerpt || '')}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(a.link)}</guid>
      <source url="https://aninews.vercel.app/api/news?source=${encodeURIComponent(a.source.toLowerCase().replace(/\s+/g, ''))}">${escapeXml(a.source)}</source>
${cats}
`;

    if (a.image) xml += `      <media:thumbnail url="${escapeXml(a.image)}"/>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n</rss>`;
  return xml;
}

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/rss handler ----

/**
 * Main request handler for GET /api/rss.
 *
 * Query parameters:
 *   - source ('all'|specific key, default 'all')
 *   - limit (1-100, default 20)
 */
module.exports = async (req, res) => {
  const startTime = Date.now();
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const source = req.query.source?.toLowerCase() || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

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
      } else {
        return res.status(400).json({ success: false, error: 'Invalid source', timestamp: new Date().toISOString() });
      }

      const results = await Promise.allSettled(fetchPromises);
      articles = [];
      results.forEach(r => {
        if (r.status === 'fulfilled') articles = articles.concat(r.value || []);
      });
      if (articles.length > 0) cacheHandler.set(cacheKey, articles, 600);
    }

    // Sort newest first and generate XML
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    const rssXml = generateRSS(articles.slice(0, limit), source);
    const responseTime = Date.now() - startTime;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.status(200).send(rssXml);
  } catch (error) {
    console.error('[RSS API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate RSS feed', message: error.message, timestamp: new Date().toISOString() });
  }
};

// ══════════════════════════════════════════════════════════════ END: api/rss.js
