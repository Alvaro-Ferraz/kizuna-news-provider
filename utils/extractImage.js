/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — extractImage.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Shared image extraction utility for RSS feed items.
 *   Checks multiple RSS fields in priority order and
 *   normalizes URLs (protocol-relative, tracking params).
 *
 * @exports extractImage
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// IMAGE EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: RSS image extraction ----

/**
 * Extract the best image URL from an RSS feed item.
 *
 * Priority chain:
 *   1. media:thumbnail URL
 *   2. enclosure URL (image/* type)
 *   3. First <img src="..."> in content:encoded
 *   4. First <img src="..."> in content
 *   5. First <img src="..."> in description
 *   6. Empty string
 *
 * Also normalizes:
 *   - Protocol-relative URLs (//example.com → https://example.com)
 *   - Tracking query params (?ssl=1, ?w=600, etc.)
 *
 * @param {Object} item - RSS parser feed item
 * @returns {string} Image URL or empty string
 */
function extractImage(item) {
  if (!item) return '';

  // 1. media:thumbnail
  const mediaThumb = item['media:thumbnail'] || item.mediaThumbnail;
  if (mediaThumb?.url) return normalizeUrl(mediaThumb.url);

  // 2. enclosure (image type)
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return normalizeUrl(item.enclosure.url);
  }

  // 3–5. Search <img src="..."> in content fields
  const htmlFields = [
    item['content:encoded'],
    item.content,
    item.contentSnippet,
    item.description
  ];

  for (const html of htmlFields) {
    if (!html || typeof html !== 'string') continue;
    const match = html.match(/<img[^>]+src="([^"]+)"/i);
    if (match && match[1]) return normalizeUrl(match[1]);
  }

  return '';
}

// ══════════════════════════════════════════════════════════════
// URL NORMALIZATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: URL cleanup ----

/**
 * Normalize an image URL.
 *
 * - Prepends https: to protocol-relative URLs
 * - Strips common tracking query params (?ssl=1, ?w=, ?resize=)
 *
 * @param {string} url - Raw image URL
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';

  // Protocol-relative: //example.com/image.jpg → https://example.com/image.jpg
  if (url.startsWith('//')) url = `https:${url}`;

  // Strip tracking query params but keep the base URL
  const qIndex = url.indexOf('?');
  if (qIndex !== -1) {
    const base = url.substring(0, qIndex);
    const params = url.substring(qIndex + 1);
    // Keep only meaningful params (not ssl, w, resize, strip, fit, etc.)
    const keep = params.split('&').filter(p => {
      const key = p.split('=')[0].toLowerCase();
      return !['ssl', 'w', 'resize', 'strip', 'fit', 'h', 'width', 'height', 'quality'].includes(key);
    });
    url = keep.length > 0 ? `${base}?${keep.join('&')}` : base;
  }

  return url;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = extractImage;

// ══════════════════════════════════════════════════════════════ END: extractImage.js
