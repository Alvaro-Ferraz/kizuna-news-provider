/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchAnimeHerald.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Anime Herald. Uses RSS feed as primary
 *   source (has real contentSnippet descriptions) with web
 *   scraping as fallback. Returns up to 10 articles.
 *
 * @exports fetchAnimeHerald(retries)
 *
 * @version 4.1.6
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

// ---- FEATURE: Anime Herald source URLs ----

/** @type {string} Direct website URL */
const AH_URL = 'https://www.animeherald.com/';

/** @type {string} RSS feed URL */
const AH_RSS = 'https://www.animeherald.com/feed/';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Web scraping fetcher ----

/**
 * Fetch Anime Herald articles by scraping the website.
 * Tries multiple CSS selector sets for resilience.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb() {
  try {
    console.log('[AnimeHerald] Fetching from web...');

    const { data } = await axios.get(AH_URL, {
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
      '.post',
      '.entry',
      'article'
    ];

    for (const selector of selectors) {
      $(selector).each((i, el) => {
        if (articles.length >= 10) return false;

        const $el = $(el);

        // Extract title
        const title = $el.find('h2 a, h3 a, .entry-title a, .post-title a').first().text().trim();
        if (!title) return;

        // Extract excerpt
        const excerpt = $el.find('.entry-summary, .excerpt').first().text().trim();

        // Extract date
        const dateAttr = $el.find('time').attr('datetime');
        const dateText = $el.find('.entry-date, time, .date').first().text().trim();
        const date = dateParser.parse(dateAttr || dateText, new Date());

        // Extract image — try src and data-src
        let image = $el.find('img').first().attr('src') ||
                   $el.find('img').first().attr('data-src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        // Extract link
        const link = $el.find('h2 a, h3 a, .entry-title a, .post-title a').first().attr('href') || '';

        // Extract tags
        const tags = [];
        $el.find('.cat-links a, .category a, .tags a').each((i, tag) => {
          const tagText = $(tag).text().trim().toLowerCase();
          if (tagText) tags.push(tagText);
        });

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'animeherald'),
            source: 'Anime Herald',
            excerpt: excerpt,
            date: date.toISOString(),
            image,
            link,
            tags: tags.length > 0 ? tags : ['news', 'anime']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[AnimeHerald] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[AnimeHerald] Web fetch error:', error.message);
    return [];
  }
}

// ---- FEATURE: RSS feed fetcher ----

/**
 * Fetch Anime Herald articles from RSS feed.
 * NOTE: Preferred over web scraping because RSS includes
 *       real contentSnippet descriptions.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    console.log('[AnimeHerald] Fetching from RSS...');

    const feed = await rssParser.parseURL(AH_RSS);
    const articles = [];

    feed.items.slice(0, 10).forEach(item => {
      const title = item.title?.trim();
      const excerpt = item.contentSnippet || '';
      const date = dateParser.parse(item.pubDate || item.isoDate, new Date());
      const link = item.link;

      // Extract image from content:encoded HTML
      let image = '';
      const imgMatch = item['content:encoded']?.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) {
        image = imgMatch[1];
      }

      // Extract categories
      const tags = item.categories?.map(c => c.toLowerCase()) || ['news', 'anime'];

      if (title && link) {
        articles.push({
          title,
          slug: generateSlug(title, 'animeherald'),
          source: 'Anime Herald',
          excerpt: excerpt,
          date: date.toISOString(),
          image,
          link,
          tags
        });
      }
    });

    console.log(`[AnimeHerald] Found ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error('[AnimeHerald] RSS fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime Herald fetch with retry ----

/**
 * Fetch Anime Herald articles with exponential backoff retry.
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
        console.log(`[AnimeHerald] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[AnimeHerald] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[AnimeHerald] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchAnimeHerald.js
