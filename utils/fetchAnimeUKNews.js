/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchAnimeUKNews.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Anime UK News. Uses RSS feed for
 *   article list and web scraping for images (RSS feed
 *   does not include images). Returns up to 12 articles.
 *
 * @exports fetchAnimeUKNews(retries)
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

// ---- FEATURE: Anime UK News source URLs ----

/** @type {string} RSS feed URL */
const AUK_RSS = 'https://animeuknews.net/category/news/feed';

/** @type {string[]} Direct page URLs (tried in order as fallback) */
const AUK_URLS = ['https://animeuknews.net/category/news', 'https://animeuknews.net'];

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
 * Fetch Anime UK News articles via RSS feed.
 * RSS items lack images, so fetches OG image from each article page.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    console.log('[ANIMEUKNEWS] Fetching from RSS...');
    const feed = await rssParser.parseURL(AUK_RSS);
    const articles = [];

    for (const item of feed.items.slice(0, 12)) {
      const title = item.title?.trim();
      if (!title || !item.link) continue;

      const excerpt = item.contentSnippet || item.content || '';
      const date = dateParser.parse(item.pubDate || item.isoDate, new Date());
      const tags = item.categories?.map(c => c.toLowerCase()) || ['anime', 'uk'];

      // Fetch image from article page (RSS doesn't include images)
      const image = await fetchArticleImage(item.link);

      articles.push({
        title,
        slug: generateSlug(title, 'animeuknews'),
        source: 'Anime UK News',
        excerpt,
        date: date.toISOString(),
        image,
        link: item.link,
        tags
      });
    }

    console.log(`[ANIMEUKNEWS] Found ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error('[ANIMEUKNEWS] RSS error:', error.message);
    return [];
  }
}

// ---- FEATURE: Direct web scraping fetcher ----

/**
 * Fetch Anime UK News articles by scraping the website.
 * Tries multiple URL variants and CSS selectors.
 *
 * @param {number} [urlIndex=0] - Index into AUK_URLS array
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb(urlIndex = 0) {
  try {
    const url = AUK_URLS[urlIndex];
    console.log(`[ANIMEUKNEWS] Fetching from web (${url})...`);
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    for (const selector of ['article', '.post', '.entry', '.news-item', 'a[href*="/2026/"]']) {
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
        const fullLink = link.startsWith('http') ? link : `https://animeuknews.net${link}`;

        if (title && fullLink) {
          articles.push({
            title,
            slug: generateSlug(title, 'animeuknews'),
            source: 'Anime UK News',
            excerpt,
            date: date.toISOString(),
            image,
            link: fullLink,
            tags: ['anime', 'uk', 'news']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[ANIMEUKNEWS] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[ANIMEUKNEWS] Web fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime UK News fetch with retry ----

/**
 * Fetch Anime UK News articles with exponential backoff retry.
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
        console.log(`[ANIMEUKNEWS] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[ANIMEUKNEWS] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[ANIMEUKNEWS] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchAnimeUKNews.js
