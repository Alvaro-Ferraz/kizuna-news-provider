/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — fetchANN.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   News fetcher for Anime News Network (ANN).
 *   Uses Google News RSS as primary source with direct
 *   web scraping as fallback. Returns up to 15 articles.
 *
 * @exports fetchANN(retries)
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

// ---- FEATURE: ANN source URLs ----

/** @type {string} Direct news page URL */
const ANN_URL = 'https://www.animenewsnetwork.com/news/';

/**
 * Google News RSS proxy for ANN.
 * NOTE: Used as primary because ANN's direct access is often
 *       blocked by Cloudflare. Google News RSS is more reliable.
 * @type {string}
 */
const ANN_GNEWS = 'https://news.google.com/rss/search?q=site:animenewsnetwork.com%2Fnews&hl=en-US&gl=US&ceid=US:en';

// ══════════════════════════════════════════════════════════════
// FETCHERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Google News RSS fetcher ----

/**
 * Fetch ANN articles via Google News RSS proxy.
 *
 * @returns {Promise<Array<{title: string, slug: string, source: string, excerpt: string, date: string, image: string, link: string, tags: string[]}>>}
 */
async function fetchFromGoogleNews() {
  try {
    console.log('[ANN] Fetching from Google News RSS...');
    const feed = await rssParser.parseURL(ANN_GNEWS);
    const articles = [];

    feed.items.slice(0, 15).forEach(item => {
      const title = item.title?.trim();
      if (!title) return;

      // Strip " - Anime News Network" suffix from Google News titles
      const cleanTitle = title.replace(/\s*-\s*Anime News Network.*$/i, '').trim();
      const excerpt = item.contentSnippet || item.content || '';
      const date = dateParser.parse(item.pubDate || item.isoDate, new Date());

      // Extract image from content:encoded HTML
      let image = '';
      const imgMatch = item['content:encoded']?.match(/<img[^>]+src="([^"]+)"/);
      if (imgMatch) image = imgMatch[1];

      const tags = item.categories?.map(c => c.toLowerCase()) || ['news', 'anime'];

      if (cleanTitle && item.link) {
        articles.push({
          title: cleanTitle,
          slug: generateSlug(cleanTitle, 'ann'),
          source: 'Anime News Network',
          excerpt: excerpt,
          date: date.toISOString(),
          image,
          link: item.link,
          tags
        });
      }
    });

    console.log(`[ANN] Found ${articles.length} articles from Google News`);
    return articles;
  } catch (error) {
    console.error('[ANN] Google News error:', error.message);
    return [];
  }
}

// ---- FEATURE: Direct web scraping fallback ----

/**
 * Fetch ANN articles by scraping the news page directly.
 * Falls back to multiple CSS selectors for resilience.
 *
 * @returns {Promise<Array<{title: string, slug: string, source: string, excerpt: string, date: string, image: string, link: string, tags: string[]}>>}
 */
async function fetchFromWeb() {
  try {
    console.log('[ANN] Fetching from web...');
    const { data } = await axios.get(ANN_URL, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT
    });

    const $ = cheerio.load(data);
    const articles = [];

    // Try multiple selectors — most specific first
    for (const selector of ['.herald.box.news', '.news-item', 'article.news', '.news-article']) {
      $(selector).each((i, el) => {
        if (articles.length >= 15) return false;

        const $el = $(el);
        const title = $el.find('h3 a, .title a, h2 a').first().text().trim();
        if (!title) return;

        const excerpt = $el.find('.preview, .excerpt, .summary').first().text().trim();
        const dateAttr = $el.find('time').attr('datetime');
        const dateText = $el.find('.byline, .date, time').first().text().trim();
        const date = dateParser.parse(dateAttr || dateText, new Date());

        let image = $el.find('img').attr('src') || '';
        if (image.startsWith('//')) image = `https:${image}`;

        let link = $el.find('h3 a, .title a, h2 a').first().attr('href') || '';
        if (link && !link.startsWith('http')) link = `https://www.animenewsnetwork.com${link}`;

        const tags = [];
        $el.find('.tags a, .category a').each((i, t) => {
          const tt = $(t).text().trim().toLowerCase();
          if (tt) tags.push(tt);
        });

        if (title && link) {
          articles.push({
            title,
            slug: generateSlug(title, 'ann'),
            source: 'Anime News Network',
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

    console.log(`[ANN] Found ${articles.length} articles from web`);
    return articles;
  } catch (error) {
    console.error('[ANN] Web fetch error:', error.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION (with retry logic)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: ANN fetch with retry ----

/**
 * Fetch Anime News Network articles with exponential backoff retry.
 *
 * Strategy: Google News RSS → Direct web scrape → Retry
 *
 * @param {number} [retries=2] - Number of retry attempts
 * @returns {Promise<Array>} Array of article objects, or empty array on failure
 */
module.exports = async (retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      let articles = await fetchFromGoogleNews();
      if (articles.length === 0) articles = await fetchFromWeb();
      if (articles.length > 0) return articles;

      // Exponential backoff before retry
      if (i < retries) {
        console.log(`[ANN] Retry ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (error) {
      console.error(`[ANN] Attempt ${i + 1} failed:`, error.message);
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  console.error('[ANN] All fetch attempts failed');
  return [];
};

// ══════════════════════════════════════════════════════════════ END: fetchANN.js
