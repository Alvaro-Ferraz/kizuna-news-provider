/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchMyAnimeList.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for MyAnimeList (MAL). Scrapes the news
 *   page with custom date parsing for MAL's non-standard
 *   date formats. Fetches both page 1 and page 2 for variety.
 *   Returns up to 25 articles.
 *
 * @exports fetchMyAnimeList(retries)
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

// ══════════════════════════════════════════════════════════════
// SOURCE URL
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: MAL source URL ----

/** @type {string} MAL news page */
const MAL_URL = 'https://myanimelist.net/news';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: MAL page 1 scraper ----

/**
 * Fetch articles from MAL news page (page 1).
 *
 * NOTE: MAL uses `.info` text for dates (e.g. "12:34 AM, Yesterday")
 *       instead of standard datetime attributes. We use the
 *       parseMALDate() helper for this custom format.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromWeb() {
  try {
    console.log('[MAL] Fetching from web...');

    const { data } = await axios.get(MAL_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'mqlid=1; is_logged_in=0'
      },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    // Selectors for news unit containers (order matters — most specific first)
    const selectors = [
      '.news-unit',
      '.news-list .news-unit',
      '.news-unit.clearfix'
    ];

    for (const selector of selectors) {
      $(selector).each((i, el) => {
        if (articles.length >= 15) return false;

        const $el = $(el);

        // Extract title
        const title = $el.find('.title a, h2 a, h3 a, a.title').first().text().trim();
        if (!title) return;

        // NOTE: Use .text first (MAL's actual excerpt class), avoid generic 'p'
        //       which matches .title — this was a previous bug (v4.1.1 fix)
        const excerpt = $el.find('.text, .excerpt, .summary').first().text().trim();

        // Extract date — MAL has custom format in .info
        const infoText = $el.find('.info, .date, time').first().text().trim();
        const dateAttr = $el.find('time').attr('datetime');

        // Use improved MAL date parser for custom formats
        let date;
        if (dateAttr) {
          date = dateParser.parse(dateAttr, new Date());
        } else if (infoText) {
          date = dateParser.parseMALDate(infoText);
        } else {
          date = new Date();
        }

        // Extract image — try src and data-src
        let image = $el.find('.image img, img').first().attr('src') ||
                   $el.find('.image img, img').first().attr('data-src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        // Extract link — make absolute
        let link = $el.find('.title a, h2 a, h3 a, a.title').first().attr('href') || '';
        if (link && !link.startsWith('http')) {
          link = `https://myanimelist.net${link}`;
        }

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'myanimelist'),
            source: 'MyAnimeList',
            excerpt: excerpt,
            date: date.toISOString(),
            image,
            link,
            tags: ['official', 'news']
          });
        }
      });

      if (articles.length > 0) break;
    }

    console.log(`[MAL] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[MAL] Web fetch error:', error.message);
    return [];
  }
}

// ---- FEATURE: MAL page 2 scraper ----

/**
 * Fetch articles from MAL news page 2 for additional variety.
 * Called when page 1 returns fewer than 10 articles.
 *
 * @returns {Promise<Array>} Array of article objects
 */
async function fetchFromPage2() {
  try {
    console.log('[MAL] Fetching from page 2...');

    const { data } = await axios.get(`${MAL_URL}?p=2`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    $('.news-unit').each((i, el) => {
      if (articles.length >= 10) return false;

      const $el = $(el);
      const title = $el.find('.title a').text().trim();
      const excerpt = $el.find('.text').text().trim();
      const infoText = $el.find('.info').text().trim();
      const date = dateParser.parseMALDate(infoText);

      let image = $el.find('.image img').attr('src') || '';
      if (image.startsWith('//')) image = `https:${image}`;

      let link = $el.find('.title a').attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = `https://myanimelist.net${link}`;
      }

      if (title && link) {
        articles.push({
          title,
          slug: generateSlug(title, 'myanimelist'),
          source: 'MyAnimeList',
          excerpt: excerpt,
          date: date.toISOString(),
          image,
          link,
          tags: ['official', 'news']
        });
      }
    });

    console.log(`[MAL] Found ${articles.length} articles from page 2`);
    return articles;
  } catch (error) {
    console.error('[MAL] Page 2 fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: MAL fetch with retry ----

/**
 * Fetch MyAnimeList articles with exponential backoff retry.
 *
 * Strategy: Page 1 → Page 2 (if <10 articles) → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      let articles = await fetchFromWeb();

      // If we got fewer articles, try page 2 for more variety
      if (articles.length < 10) {
        const page2Articles = await fetchFromPage2();
        articles = [...articles, ...page2Articles];
      }

      if (articles.length > 0) {
        return articles;
      }

      if (i < retries) {
        console.log(`[MAL] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[MAL] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[MAL] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchMyAnimeList.js
