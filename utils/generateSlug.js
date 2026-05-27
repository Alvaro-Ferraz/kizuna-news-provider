/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — generateSlug.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   URL-safe slug generator for article identifiers.
 *   Produces deterministic, collision-free slugs from
 *   article titles and source keys using a daily-reset
 *   counter for deduplication.
 *
 * @exports generateSlug(title, source)
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// IN-MEMORY SLUG COUNTER
// ══════════════════════════════════════════════════════════════

/**
 * Daily-reset counter for slug deduplication.
 * NOTE: Resets at midnight — two articles with the same title
 *       on different days will get identical slugs (by design).
 *       Serverless cold starts also reset this counter.
 *
 * @type {{date: string, count: Object.<string, number>}}
 */
let slugCounter = {};

// ══════════════════════════════════════════════════════════════
// SLUG GENERATOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Slug generation ----

/**
 * Generate a URL-safe slug from an article title and source key.
 *
 * Pipeline:
 *   1. Normalize unicode (NFD) and strip diacritics
 *   2. Remove non-word characters (except hyphens)
 *   3. Collapse whitespace to hyphens
 *   4. Truncate to 80 chars
 *   5. Prefix with source key
 *   6. Append counter suffix if duplicate today
 *
 * @param {string} title - Raw article title
 * @param {string} source - Source key (e.g. 'ann', 'crunchyroll')
 * @returns {string} URL-safe slug (e.g. 'ann-new-anime-series-2025')
 */
module.exports = (title, source) => {
  // Reset counter daily — prevents unbounded memory growth
  const today = new Date().toDateString();
  if (slugCounter.date !== today) {
    slugCounter = { date: today, count: {} };
  }

  const cleanTitle = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents (café → cafe)
    .replace(/[^\w\s-]/g, '')        // Keep only word chars, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')            // Spaces → hyphens
    .substring(0, 80);               // Cap length for URL friendliness

  const baseSlug = `${source}-${cleanTitle}`;

  // Ensure unique slug within the same day
  if (!slugCounter.count[baseSlug]) {
    slugCounter.count[baseSlug] = 0;
  }
  slugCounter.count[baseSlug]++;

  const count = slugCounter.count[baseSlug];
  return count > 1 ? `${baseSlug}-${count}` : baseSlug;
};

// ══════════════════════════════════════════════════════════════ END: generateSlug.js
