/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchRandomCuriosity.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Random Curiosity. Uses direct RSS
 *   feed as primary source with web scraping as fallback.
 *   Images extracted from description field with
 *   protocol-relative URL normalization.
 *   Returns up to 12 articles.
 *
 * @exports fetchRandomCuriosity(retries)
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const cheerio = require('cheerio');
const generateSlug = require('./generateSlug');
const dateParser = require('./dateParser');
const extractImage = require('./extractImage');
const { USER_AGENT, REQUEST_TIMEOUT } = require('./constants');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// ══════════════════════════════════════════════════════════════
// SOURCE URLS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Random Curiosity source URLs ----

/** @type {string} RSS feed URL */
const RC_RSS = 'https://randomc.net/feed';

/** @type {string[]} Direct page URLs (tried in order as fallback) */
const RC_URLS = ['https://randomc.net', 'https://randomc.net/news'];

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: RSS fetcher ----

/**
 * Fetch Random Curiosity articles via RSS feed.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    console.log('[RANDOMCURIOSITY] Fetching from RSS...');
    const feed = await rssParser.parseURL(RC_RSS);
    const articles = [];

    feed.items.slice(0, 12).forEach(item => {
      const title = item.title?.trim();
      if (!title) return;

      const excerpt = item.contentSnippet || item.content || '';
      const date = dateParser.parse(item.pubDate || item.isoDate, new Date());
      const image = extractImage(item);
      const tags = item.categories?.map(c => c.toLowerCase()) || ['anime', 'review'];

      if (item.link) {
        articles.push({
          title,
          slug: generateSlug(title, 'randomcuriosity'),
          source: 'Random Curiosity',
          excerpt,
          date: date.toISOString(),
          image,
          link: item.link,
          tags
        });
      }
    });

    console.log(`[RANDOMCURIOSITY] Found ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error('[RANDOMCURIOSITY] RSS error:', error.message);
    return [];
  }
}

// ---- FEATURE: Direct web scraping fetcher ----

/**
 * Fetch Random Curiosity articles by scraping the website.
 * Tries multiple URL variants and CSS selectors.
 *
 * @param {number} [urlIndex=0] - Index into RC_URLS array
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb(urlIndex = 0) {
  try {
    const url = RC_URLS[urlIndex];
    console.log(`[RANDOMCURIOSITY] Fetching from web (${url})...`);
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    for (const selector of ['article', '.post', '.entry', '.article', 'a[href*="/2026/"]']) {
      $(selector).each((i, el) => {
        if (articles.length >= 10) return false;

        const $el = $(el);
        const title = $el.find('h2, h3, .title, .entry-title').first().text().trim()
          || $el.attr('title')?.trim();
        if (!title) return;

        const excerpt = $el.find('p, .excerpt, .summary').first().text().trim();
        const dateText = $el.find('time, .date, .published').first().text().trim()
          || $el.find('time').attr('datetime');
        const date = dateParser.parse(dateText, new Date());

        let image = $el.find('img').first().attr('src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        const link = $el.find('a').first().attr('href') || $el.attr('href') || '';
        const fullLink = link.startsWith('http') ? link : `https://randomc.net${link}`;

        if (title && fullLink) {
          articles.push({
            title,
            slug: generateSlug(title, 'randomcuriosity'),
            source: 'Random Curiosity',
            excerpt,
            date: date.toISOString(),
            image,
            link: fullLink,
            tags: ['anime', 'preview', 'review']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[RANDOMCURIOSITY] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[RANDOMCURIOSITY] Web fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Random Curiosity fetch with retry ----

/**
 * Fetch Random Curiosity articles with exponential backoff retry.
 *
 * Strategy: RSS → Web scrape (homepage) → Web scrape (/news) → Retry
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
        console.log(`[RANDOMCURIOSITY] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[RANDOMCURIOSITY] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[RANDOMCURIOSITY] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchRandomCuriosity.js
