/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchAllSources.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Shared fetch-from-sources module. Extracted from news.js
 *   to eliminate code duplication across news.js, search.js,
 *   and rss.js. Handles parallel fetching, deduplication,
 *   sorting, and source tracking.
 *
 * @exports fetchAll, fetchSingle
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const cacheHandler = require('./cacheHandler');
const { SOURCES, SOURCE_KEYS } = require('./sources');
const { CACHE_KEYS } = require('./constants');

// ══════════════════════════════════════════════════════════════
// DEDUPLICATION
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

// ══════════════════════════════════════════════════════════════
// SHARED FETCH LOGIC
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Parallel source fetching ----

/**
 * Fetch articles from one or all sources in parallel.
 * Deduplicates, sorts by date, and normalizes fields.
 *
 * @param {string} source - Source key ('all' or specific key)
 * @returns {Promise<Array>} Deduplicated, sorted articles
 */
async function fetchAll(source) {
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

/**
 * Fetch articles from cache or sources with optional cache bypass.
 *
 * @param {string} source - Source key ('all' or specific)
 * @param {boolean} [forceRefresh=false] - Bypass cache
 * @returns {Promise<Array>} Article array
 */
async function fetchCached(source, forceRefresh = false) {
  const cacheKey = `${CACHE_KEYS.ALL.replace('all', '')}${source}`;

  if (!forceRefresh) {
    const cached = cacheHandler.get(cacheKey);
    if (cached && cached.length > 0) return cached;
  } else {
    cacheHandler.del(cacheKey);
  }

  const articles = await fetchAll(source);
  if (articles.length > 0) {
    cacheHandler.set(cacheKey, articles, 600);
  }
  return articles;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = { fetchAll, fetchCached, deduplicateArticles };

// ══════════════════════════════════════════════════════════════ END: fetchAllSources.js
