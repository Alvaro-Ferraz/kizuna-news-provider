/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchAnimeTrending.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Anime Trending. Uses direct RSS
 *   feed as primary source with web scraping as fallback.
 *   Images extracted from content:encoded field.
 *   Returns up to 12 articles.
 *
 * @exports fetchAnimeTrending(retries)
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const cheerio = require('cheerio');
const generateSlug = require('./generateSlug');
const extractImage = require('./extractImage');
const { USER_AGENT, REQUEST_TIMEOUT } = require('./constants');
const logger = require('../src/logger');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// ══════════════════════════════════════════════════════════════
// SOURCE URLS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime Trending source URLs ----

/** @type {string} RSS feed URL */
const AT_RSS = 'https://anitrendz.net/news/feed';

/** @type {string[]} Direct page URLs (tried in order as fallback) */
const AT_URLS = ['https://anitrendz.net/news', 'https://anitrendz.net'];

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: RSS fetcher ----

/**
 * Fetch Anime Trending articles via RSS feed.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    logger.info('provider_fetch_started', { providerKey: 'animetrending', method: 'DIRECT_RSS' });
    const feed = await rssParser.parseURL(AT_RSS);
    const articles = [];

    feed.items.slice(0, 12).forEach(item => {
      const title = item.title?.trim();
      if (!title) return;

      const excerpt = item.contentSnippet || item.content || '';
      const date = item.pubDate || item.isoDate || null;
      const image = extractImage(item);
      const tags = item.categories?.map(c => c.toLowerCase()) || ['anime', 'news'];

      if (item.link) {
        articles.push({
          title,
          slug: generateSlug(title, 'animetrending'),
          source: 'Anime Trending',
          excerpt,
          date,
          image,
          link: item.link,
          tags,
          providerArticleId: item.guid || null,
          discoveryMethod: 'DIRECT_RSS'
        });
      }
    });

    logger.info('provider_fetch_succeeded', { providerKey: 'animetrending', method: 'DIRECT_RSS', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'animetrending', method: 'DIRECT_RSS', errorClass: error.constructor.name });
    return [];
  }
}

// ---- FEATURE: Direct web scraping fetcher ----

/**
 * Fetch Anime Trending articles by scraping the website.
 * Tries multiple URL variants and CSS selectors.
 *
 * @param {number} [urlIndex=0] - Index into AT_URLS array
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb(urlIndex = 0) {
  try {
    const url = AT_URLS[urlIndex];
    logger.info('provider_fetch_started', { providerKey: 'animetrending', method: 'DIRECT_HTML', fallbackIndex: urlIndex });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    for (const selector of ['article', '.post', '.entry', '.news-card', 'a[href*="/news/"]']) {
      $(selector).each((i, el) => {
        if (articles.length >= 10) return false;

        const $el = $(el);
        const title = $el.find('h2, h3, .title, .entry-title').first().text().trim()
          || $el.attr('title')?.trim();
        if (!title) return;

        const excerpt = $el.find('p, .excerpt, .summary').first().text().trim();
        const dateText = $el.find('time, .date, .published').first().text().trim()
          || $el.find('time').attr('datetime');
        const date = dateText || null;

        let image = $el.find('img').first().attr('src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        const link = $el.find('a').first().attr('href') || $el.attr('href') || '';
        const fullLink = link.startsWith('http') ? link : `https://anitrendz.net${link}`;

        if (title && fullLink) {
          articles.push({
            title,
            slug: generateSlug(title, 'animetrending'),
            source: 'Anime Trending',
            excerpt,
            date,
            image,
            link: fullLink,
            tags: ['anime', 'trending', 'charts'],
            providerArticleId: null,
            discoveryMethod: 'DIRECT_HTML'
          });
        }
      });

      if (articles.length > 0) break;
    }

    logger.info('provider_fetch_succeeded', { providerKey: 'animetrending', method: 'DIRECT_HTML', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'animetrending', method: 'DIRECT_HTML', errorClass: error.constructor.name });
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime Trending fetch with retry ----

/**
 * Fetch Anime Trending articles with exponential backoff retry.
 *
 * Strategy: RSS → Web scrape (/news) → Web scrape (homepage) → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      let articles = await fetchFromRSS();
      if (articles.length === 0) {
        articles = await fetchFromWeb(0);
        if (articles.length === 0) articles = await fetchFromWeb(1);
      }
      if (articles.length > 0) return articles;

      if (i < retries) {
        logger.info('provider_fetch_retry', { providerKey: 'animetrending', attempt: i + 1, maximumAttempts: retries });
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      logger.error('provider_fetch_attempt_failed', { providerKey: 'animetrending', attempt: i + 1, errorClass: error.constructor.name });
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  logger.error('provider_fetch_exhausted', { providerKey: 'animetrending' });
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchAnimeTrending.js
