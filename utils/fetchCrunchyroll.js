/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchCrunchyroll.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Crunchyroll. Uses Google News RSS as
 *   primary source (direct access is blocked) with direct
 *   web scraping as fallback across two URL variants.
 *   Returns up to 15 articles.
 *
 * @exports fetchCrunchyroll(retries)
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

// ---- FEATURE: Crunchyroll source URLs ----

/** @type {string[]} Direct news page URLs (tried in order) */
const CR_URLS = ['https://www.crunchyroll.com/news', 'https://www.crunchyroll.com/news/latest'];

/**
 * Google News RSS proxy for Crunchyroll.
 * NOTE: Primary source because Crunchyroll blocks direct scraping.
 * @type {string}
 */
const CR_GNEWS = 'https://news.google.com/rss/search?q=site:crunchyroll.com%2Fnews&hl=en-US&gl=US&ceid=US:en';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Google News RSS fetcher ----

/**
 * Fetch Crunchyroll articles via Google News RSS proxy.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromGoogleNews() {
  try {
    logger.info('provider_fetch_started', { providerKey: 'crunchyroll', method: 'GOOGLE_NEWS_RSS' });
    const feed = await rssParser.parseURL(CR_GNEWS);
    const articles = [];

    feed.items.slice(0, 15).forEach(item => {
      const title = item.title?.trim();
      if (!title) return;

      // Strip " - Crunchyroll" or " - Crunchyroll News" suffix
      const cleanTitle = title.replace(/\s*-\s*(Crunchyroll|Crunchyroll News).*$/i, '').trim();
      const excerpt = item.contentSnippet || item.content || '';
      const date = item.pubDate || item.isoDate || null;

      // Extract image from content:encoded
      let image = '';
      const imgMatch = item['content:encoded']?.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) image = imgMatch[1];

      const tags = item.categories?.map(c => c.toLowerCase()) || ['official', 'news'];

      if (cleanTitle && item.link) {
        articles.push({
          title: cleanTitle,
          slug: generateSlug(cleanTitle, 'crunchyroll'),
          source: 'Crunchyroll',
          excerpt: excerpt,
          date,
          image,
          link: item.link,
          tags,
          providerArticleId: null,
          discoveryMethod: 'GOOGLE_NEWS_RSS'
        });
      }
    });

    logger.info('provider_fetch_succeeded', { providerKey: 'crunchyroll', method: 'GOOGLE_NEWS_RSS', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'crunchyroll', method: 'GOOGLE_NEWS_RSS', errorClass: error.constructor.name });
    return [];
  }
}

// ---- FEATURE: Direct web scraping fetcher ----

/**
 * Fetch Crunchyroll articles by scraping the news page.
 * Tries both /news and /news/latest URLs.
 *
 * @param {number} [urlIndex=0] - Index into CR_URLS array
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb(urlIndex = 0) {
  try {
    const url = CR_URLS[urlIndex];
    logger.info('provider_fetch_started', { providerKey: 'crunchyroll', method: 'DIRECT_HTML', fallbackIndex: urlIndex });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    for (const selector of ['.news-item', 'article', '.article-card', '[class*="news"]']) {
      $(selector).each((i, el) => {
        if (articles.length >= 12) return false;

        const $el = $(el);
        const title = $el.find('h2, h3, .title, .news-item__title').first().text().trim();
        if (!title || title.length < 10) return;

        const excerpt = $el.find('.description, .excerpt').first().text().trim();
        const dateAttr = $el.find('time').attr('datetime');
        const dateText = $el.find('time, .date').first().text().trim();
        const date = dateAttr || dateText || null;

        let image = $el.find('img').first().attr('src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        let link = $el.find('a').first().attr('href') || '';
        if (link && !link.startsWith('http')) link = `https://www.crunchyroll.com${link}`;

        const tags = [$el.find('.category, .tag').first().text().trim().toLowerCase() || 'official', 'news'];

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'crunchyroll'),
            source: 'Crunchyroll',
            excerpt: excerpt,
            date,
            image,
            link,
            tags,
            providerArticleId: null,
            discoveryMethod: 'DIRECT_HTML'
          });
        }
      });

      if (articles.length > 0) break;
    }

    logger.info('provider_fetch_succeeded', { providerKey: 'crunchyroll', method: 'DIRECT_HTML', articleCount: articles.length });
    return articles;
  } catch (error) {
    logger.error('provider_fetch_failed', { providerKey: 'crunchyroll', method: 'DIRECT_HTML', errorClass: error.constructor.name });
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Crunchyroll fetch with retry ----

/**
 * Fetch Crunchyroll articles with exponential backoff retry.
 *
 * Strategy: Google News RSS → /news → /news/latest → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      let articles = await fetchFromGoogleNews();
      if (articles.length === 0) {
        articles = await fetchFromWeb(0);
        if (articles.length === 0) articles = await fetchFromWeb(1);
      }
      if (articles.length > 0) return articles;

      if (i < retries) {
        logger.info('provider_fetch_retry', { providerKey: 'crunchyroll', attempt: i + 1, maximumAttempts: retries });
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      logger.error('provider_fetch_attempt_failed', { providerKey: 'crunchyroll', attempt: i + 1, errorClass: error.constructor.name });
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  logger.error('provider_fetch_exhausted', { providerKey: 'crunchyroll' });
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchCrunchyroll.js
