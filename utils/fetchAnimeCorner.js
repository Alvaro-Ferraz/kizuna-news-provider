/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchAnimeCorner.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Anime Corner. Uses RSS feed as primary
 *   source (has real contentSnippet descriptions) with web
 *   scraping as fallback. Returns up to 12 articles.
 *
 * @exports fetchAnimeCorner(retries)
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const cheerio = require('cheerio');
const generateSlug = require('./generateSlug');
const { USER_AGENT, REQUEST_TIMEOUT } = require('./constants');
const logger = require('../src/logger');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// ══════════════════════════════════════════════════════════════
// SOURCE URLS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime Corner source URLs ----

/** @type {string} Direct website URL */
const AC_URL = 'https://animecorner.me/';

/** @type {string} RSS feed URL */
const AC_RSS = 'https://animecorner.me/feed/';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Web scraping fetcher ----

/**
 * Fetch Anime Corner articles by scraping the website.
 * Tries multiple CSS selector sets for resilience against layout changes.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb() {
  try {
    logger.info('provider_fetch_started', { providerKey: 'animecorner', method: 'DIRECT_HTML' });

    const { data } = await axios.get(AC_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    // Selector priority — most specific first
    const selectors = [
      'article.post',
      'article.type-post',
      '.post-item',
      'article',
      '.entry-card'
    ];

    for (const selector of selectors) {
      $(selector).each((i, el) => {
        if (articles.length >= 12) return false;

        const $el = $(el);

        // Extract title
        const title = $el.find('h2.entry-title a, h3 a, .entry-title a, h2 a').first().text().trim();
        if (!title) return;

        // Extract excerpt — Anime Corner uses .item-content.entry-content for descriptions
        const excerpt = $el.find('.item-content.entry-content, .entry-excerpt, .entry-summary').first().text().trim();

        // Extract date
        const dateAttr = $el.find('time').attr('datetime');
        const dateText = $el.find('.entry-date, time, .date').first().text().trim();
        const date = dateAttr || dateText || null;

        // Extract image — try multiple lazy-load attributes
        const image = $el.find('.entry-thumb img, .featured-image img, img').first().attr('src') ||
                   $el.find('.entry-thumb img, .featured-image img, img').first().attr('data-src') ||
                   $el.find('.entry-thumb img, .featured-image img, img').first().attr('data-lazy-src') || '';

        // Extract link
        const link = $el.find('h2.entry-title a, h3 a, .entry-title a, h2 a').first().attr('href') || '';

        // Extract category tags
        const tags = [];
        $el.find('.entry-category a, .cat-links a, .category a').each((i, tag) => {
          const tagText = $(tag).text().trim().toLowerCase();
          if (tagText) tags.push(tagText);
        });

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'animecorner'),
            source: 'Anime Corner',
            excerpt: excerpt,
            date,
            image,
            link,
            tags: tags.length > 0 ? tags : ['community', 'news'],
            providerArticleId: null,
            discoveryMethod: 'DIRECT_HTML'
          });
        }
      });

      if (articles.length > 0) break;
    }

    logger.info('provider_fetch_succeeded', { providerKey: 'animecorner', method: 'DIRECT_HTML', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'animecorner', method: 'DIRECT_HTML', errorClass: error.constructor.name });
    return [];
  }
}

// ---- FEATURE: RSS feed fetcher ----

/**
 * Fetch Anime Corner articles from RSS feed.
 * NOTE: Preferred over web scraping because RSS includes
 *       real contentSnippet descriptions.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    logger.info('provider_fetch_started', { providerKey: 'animecorner', method: 'DIRECT_RSS' });

    const feed = await rssParser.parseURL(AC_RSS);
    const articles = [];

    feed.items.slice(0, 12).forEach(item => {
      const title = item.title?.trim();
      const excerpt = item.contentSnippet || '';
      const date = item.pubDate || item.isoDate || null;
      const link = item.link;

      // Extract image from content:encoded HTML
      let image = '';
      const imgMatch = item['content:encoded']?.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) {
        image = imgMatch[1];
      }

      // Extract categories
      const tags = item.categories?.map(c => c.toLowerCase()) || ['community', 'news'];

      if (title && link) {
        articles.push({
          title,
          slug: generateSlug(title, 'animecorner'),
          source: 'Anime Corner',
          excerpt: excerpt,
          date,
          image,
          link,
          tags,
          providerArticleId: item.guid || null,
          discoveryMethod: 'DIRECT_RSS'
        });
      }
    });

    logger.info('provider_fetch_succeeded', { providerKey: 'animecorner', method: 'DIRECT_RSS', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'animecorner', method: 'DIRECT_RSS', errorClass: error.constructor.name });
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime Corner fetch with retry ----

/**
 * Fetch Anime Corner articles with exponential backoff retry.
 *
 * Strategy: RSS (preferred, has descriptions) → Web scrape → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      // Prefer RSS — has real descriptions; web scraping lacks excerpts
      let articles = await fetchFromRSS();

      if (articles.length === 0) {
        articles = await fetchFromWeb();
      }

      if (articles.length > 0) {
        return articles;
      }

      if (i < retries) {
        logger.info('provider_fetch_retry', { providerKey: 'animecorner', attempt: i + 1, maximumAttempts: retries });
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      logger.error('provider_fetch_attempt_failed', { providerKey: 'animecorner', attempt: i + 1, errorClass: error.constructor.name });
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  logger.error('provider_fetch_exhausted', { providerKey: 'animecorner' });
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchAnimeCorner.js
