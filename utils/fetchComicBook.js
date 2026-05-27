/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchComicBook.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Comic Book (comicbook.com). Uses web
 *   scraping as primary with RSS feed as fallback. Returns
 *   up to 10 articles.
 *
 * @exports fetchComicBook(retries)
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

// ---- FEATURE: Comic Book source URLs ----

/** @type {string} Direct anime section URL */
const CB_URL = 'https://comicbook.com/anime/';

/** @type {string} RSS feed URL */
const CB_RSS = 'https://comicbook.com/anime/feed/';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Web scraping fetcher ----

/**
 * Fetch Comic Book articles by scraping the anime section.
 *
 * NOTE: Comic Book uses `.wp-block-savage-platform-post-subheadline`
 *       for article descriptions (not generic .excerpt).
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb() {
  try {
    console.log('[ComicBook] Fetching from web...');

    const { data } = await axios.get(CB_URL, {
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
      '.wp-block-post',
      'article',
      '.article-card',
      '.post'
    ];

    for (const selector of selectors) {
      $(selector).each((i, el) => {
        if (articles.length >= 10) return false;

        const $el = $(el);

        // Extract title — multiple selectors for different CMS layouts
        const title = $el.find('h2 a, h3 a, .wp-block-wp-curate-post-title a, .title a, .headline a').first().text().trim();
        if (!title) return;

        // Extract excerpt — Comic Book uses subheadline for descriptions
        const excerpt = $el.find('.wp-block-savage-platform-post-subheadline, .excerpt, .summary').first().text().trim();

        // Extract date
        const dateAttr = $el.find('time').attr('datetime');
        const dateText = $el.find('time, .date, .published').first().text().trim();
        const date = dateParser.parse(dateAttr || dateText, new Date());

        // Extract image — try src and data-src
        let image = $el.find('img').first().attr('src') ||
                   $el.find('img').first().attr('data-src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        // Extract link
        const link = $el.find('h2 a, h3 a, .wp-block-wp-curate-post-title a, .title a, .headline a').first().attr('href') || '';

        // Extract tags
        const tags = [];
        $el.find('.category a, .tag a').each((i, tag) => {
          const tagText = $(tag).text().trim().toLowerCase();
          if (tagText) tags.push(tagText);
        });

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'comicbook'),
            source: 'Comic Book',
            excerpt: excerpt,
            date: date.toISOString(),
            image,
            link,
            tags: tags.length > 0 ? tags : ['news', 'anime', 'manga']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[ComicBook] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[ComicBook] Web fetch error:', error.message);
    return [];
  }
}

// ---- FEATURE: RSS feed fetcher ----

/**
 * Fetch Comic Book articles from RSS feed.
 * Used as fallback when web scraping fails.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromRSS() {
  try {
    console.log('[ComicBook] Fetching from RSS...');

    const feed = await rssParser.parseURL(CB_RSS);
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
      const tags = item.categories?.map(c => c.toLowerCase()) || ['news', 'anime', 'manga'];

      if (title && link) {
        articles.push({
          title,
          slug: generateSlug(title, 'comicbook'),
          source: 'Comic Book',
          excerpt: excerpt,
          date: date.toISOString(),
          image,
          link,
          tags
        });
      }
    });

    console.log(`[ComicBook] Found ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error('[ComicBook] RSS fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Comic Book fetch with retry ----

/**
 * Fetch Comic Book articles with exponential backoff retry.
 *
 * Strategy: Web scrape → RSS fallback → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      let articles = await fetchFromWeb();

      if (articles.length === 0) {
        articles = await fetchFromRSS();
      }

      if (articles.length > 0) {
        return articles;
      }

      if (i < retries) {
        console.log(`[ComicBook] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[ComicBook] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[ComicBook] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchComicBook.js
