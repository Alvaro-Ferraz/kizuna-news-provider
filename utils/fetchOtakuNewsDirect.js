/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchOtakuNewsDirect.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Otaku News (otakunews.com). Uses
 *   direct RSS feed as primary source with web scraping
 *   as fallback. RSS feed lacks images, so fetches OG
 *   image from each article page. Returns up to 12 articles.
 *
 * @exports fetchOtakuNewsDirect(retries)
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const cheerio = require('cheerio');
const generateSlug = require('./generateSlug');
const dateParser = require('./dateParser');
const { USER_AGENT, REQUEST_TIMEOUT } = require('./constants');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// ══════════════════════════════════════════════════════════════
// SOURCE URLS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Otaku News source URLs ----

/** @type {string} RSS feed URL */
const ON_RSS = 'https://www.otakunews.com/rss/rss.xml';

/** @type {string[]} Direct page URLs (tried in order as fallback) */
const ON_URLS = ['https://www.otakunews.com', 'https://www.otakunews.com/News'];

// ══════════════════════════════════════════════════════════════
// IMAGE EXTRACTION (RSS does not contain images)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Fetch article page for image ----

/**
 * Fetch a single article page and extract its OG image.
 *
 * @param {string} url - Article URL
 * @returns {Promise<string>} Image URL or empty string
 */
async function fetchArticleImage(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });
    const $ = cheerio.load(data);
    return $('meta[property="og:image"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || $('article img').first().attr('src')
      || '';
  } catch {
    return '';
  }
}

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: RSS fetcher with image enrichment ----

/**
 * Fetch Otaku News articles via RSS feed.
 * RSS items lack images, so fetches OG image from each article page.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    console.log('[OTAKUNEWSNEW] Fetching from RSS...');
    const feed = await rssParser.parseURL(ON_RSS);
    const articles = [];

    for (const item of feed.items.slice(0, 12)) {
      const title = item.title?.trim();
      if (!title || !item.link) continue;

      const excerpt = item.contentSnippet || item.content || '';
      const date = dateParser.parse(item.pubDate || item.isoDate, new Date());
      const tags = item.categories?.map(c => c.toLowerCase()) || ['anime', 'otaku'];

      // Fetch image from article page (RSS doesn't include images)
      const image = await fetchArticleImage(item.link);

      articles.push({
        title,
        slug: generateSlug(title, 'otakunewsnew'),
        source: 'Otaku News',
        excerpt,
        date: date.toISOString(),
        image,
        link: item.link,
        tags
      });
    }

    console.log(`[OTAKUNEWSNEW] Found ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error('[OTAKUNEWSNEW] RSS error:', error.message);
    return [];
  }
}

// ---- FEATURE: Direct web scraping fetcher ----

/**
 * Fetch Otaku News articles by scraping the website.
 * Tries multiple URL variants and CSS selectors.
 *
 * @param {number} [urlIndex=0] - Index into ON_URLS array
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb(urlIndex = 0) {
  try {
    const url = ON_URLS[urlIndex];
    console.log(`[OTAKUNEWSNEW] Fetching from web (${url})...`);
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    for (const selector of ['article', '.post', '.entry', '.news-item', '.article-card', 'a[href*="/Article/"]']) {
      $(selector).each((i, el) => {
        if (articles.length >= 10) return false;

        const $el = $(el);
        const title = $el.find('h2, h3, .title, .entry-title').first().text().trim()
          || $el.attr('title')?.trim();
        if (!title) return;

        const excerpt = $el.find('p, .excerpt, .summary, .description').first().text().trim();
        const dateText = $el.find('time, .date, .published').first().text().trim()
          || $el.find('time').attr('datetime');
        const date = dateParser.parse(dateText, new Date());

        let image = $el.find('img').first().attr('src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        const link = $el.find('a').first().attr('href') || $el.attr('href') || '';
        const fullLink = link.startsWith('http') ? link : `https://www.otakunews.com${link}`;

        if (title && fullLink) {
          articles.push({
            title,
            slug: generateSlug(title, 'otakunewsnew'),
            source: 'Otaku News',
            excerpt,
            date: date.toISOString(),
            image,
            link: fullLink,
            tags: ['anime', 'otaku', 'uk']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[OTAKUNEWSNEW] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[OTAKUNEWSNEW] Web fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Otaku News fetch with retry ----

/**
 * Fetch Otaku News articles with exponential backoff retry.
 *
 * Strategy: RSS (with image enrichment) → Web scrape → Retry
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
        console.log(`[OTAKUNEWSNEW] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[OTAKUNEWSNEW] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[OTAKUNEWSNEW] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchOtakuNewsDirect.js
