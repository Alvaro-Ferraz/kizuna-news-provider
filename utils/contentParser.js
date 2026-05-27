/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — contentParser.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Full-article content extraction using Cheerio. Handles
 *   site-specific selectors for all 7 news sources plus a
 *   generic fallback. Used by the /api/news/:slug endpoint
 *   to return readable article content.
 *
 * @exports parseContent, extractText, extractImages
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const cheerio = require('cheerio');
const he = require('he');
const { USER_AGENT, CONTENT_TIMEOUT } = require('./constants');

// ══════════════════════════════════════════════════════════════
// SITE-SPECIFIC SELECTORS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Per-source content selectors ----

/**
 * Map of domain substrings to Cheerio selectors for article body content.
 * Each entry tries multiple selectors in priority order.
 *
 * NOTE: The fallback chain at the end handles unknown sources.
 *
 * @type {Object.<string, string>}
 */
const SITE_SELECTORS = {
  'animenewsnetwork.com': '.news-content, .article-content, .content-body',
  'animecorner.me':       '.entry-content, .post-content, article',
  'myanimelist.net':      '.news-unit .text, .content, article',
  'otakuusamagazine.com': '.entry-content, .post-content, article',
  'crunchyroll.com':      '.article-body, .content-body, article',
  'animeherald.com':      '.entry-content, .post-content',
  'comicbook.com':        '.article-body, .content-body'
};

// ══════════════════════════════════════════════════════════════
// CONTENT PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Full article content extraction ----

/**
 * Parse and extract full article content from a URL.
 *
 * Pipeline:
 *   1. Fetch HTML with browser-like headers
 *   2. Extract title, author, publish date
 *   3. Find article body using site-specific or fallback selectors
 *   4. Clean: remove scripts, styles, nav, empty paragraphs
 *   5. Decode HTML entities
 *   6. Fallback to plain text extraction if no HTML content found
 *
 * @param {string} url - Full article URL to parse
 * @returns {Promise<{title: string, author: string, publishDate: string, content: string, url: string, error?: string}>}
 */
module.exports = {
  parseContent: async (url) => {
    try {
      console.log(`[Parser] Parsing content from: ${url}`);

      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: CONTENT_TIMEOUT,
        maxRedirects: 5
      });

      const $ = cheerio.load(data);
      let content = '';
      let title = '';
      let author = '';
      let publishDate = '';

      // ─── Metadata extraction ───

      title = $('h1').first().text().trim() ||
              $('h2').first().text().trim() ||
              $('title').text().trim();

      author = $('.author, .byline, [rel="author"], .writer').first().text().trim();

      publishDate = $('time').attr('datetime') ||
                    $('.date, .publish-date, .posted-on').first().text().trim();

      // ─── Site-specific content extraction ───

      // Find matching selector set for this domain
      let matched = false;
      for (const [domain, selector] of Object.entries(SITE_SELECTORS)) {
        if (url.includes(domain)) {
          content = $(selector).html() || '';
          matched = true;
          break;
        }
      }

      // Generic fallback for unknown sites
      if (!matched) {
        content = $('article').html() ||
                  $('.content').html() ||
                  $('.post-content').html() ||
                  $('.entry-content').html() ||
                  $('.article-content').html() || '';
      }

      // ─── Content cleaning ───

      if (content) {
        const $content = cheerio.load(content);

        // Remove non-content elements
        $content('script, style, iframe, nav, header, footer, aside').remove();

        // Remove empty paragraphs (common in CMS-generated HTML)
        $content('p').each((i, el) => {
          if ($(el).text().trim() === '') {
            $(el).remove();
          }
        });

        content = $content.html();

        // Decode HTML entities (&amp; → &, etc.)
        content = he.decode(content);

        // Collapse multiple blank lines
        content = content.replace(/\n\s*\n/g, '\n').trim();
      }

      // ─── Plain text fallback ───

      // If no structured HTML content found, extract raw text (capped)
      if (!content) {
        content = `<p>${$('article, .content, .post').first().text().substring(0, 2000)}...</p>`;
      }

      return {
        title,
        author,
        publishDate,
        content,
        url
      };
    } catch (error) {
      console.error(`[Parser] Error parsing ${url}:`, error.message);
      return {
        title: '',
        author: '',
        publishDate: '',
        content: `<p>Unable to retrieve full content. <a href="${url}" target="_blank" rel="noopener noreferrer">View original article</a></p>`,
        url,
        error: error.message
      };
    }
  },

  // ---- FEATURE: Plain text extraction ----

  /**
   * Extract plain text from HTML content (strips all tags).
   *
   * @param {string} html - HTML string
   * @returns {string} Plain text content
   */
  extractText: (html) => {
    if (!html) return '';
    const $ = cheerio.load(html);
    return $.text().trim();
  },

  // ---- FEATURE: Image extraction ----

  /**
   * Extract all image URLs from HTML content.
   * Handles both src and data-src attributes (lazy loading).
   *
   * @param {string} html - HTML string
   * @returns {string[]} Array of absolute image URLs
   */
  extractImages: (html) => {
    if (!html) return [];
    const $ = cheerio.load(html);
    const images = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) {
        // Protocol-relative URLs → https
        images.push(src.startsWith('//') ? `https:${src}` : src);
      }
    });
    return images;
  }
};

// ══════════════════════════════════════════════════════════════ END: contentParser.js
