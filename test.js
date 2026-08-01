/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — test.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Integration test suite. Runs against a live server
 *   instance (local or deployed) to validate all API
 *   endpoints, error handling, pagination, and response
 *   formats. Exit code 0 = all passed, 1 = failures.
 *
 * @usage node test.js (requires running server)
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const axios = require('axios');
const { APP_VERSION } = require('./utils/constants');

/** @type {string} Base URL for API requests (env override for CI) */
const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// ══════════════════════════════════════════════════════════════
// TEST RUNNER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Test runner ----

/**
 * Run all integration tests sequentially.
 *
 * Each test:
 *   1. Makes an HTTP request
 *   2. Validates the response with a custom function
 *   3. Reports pass/fail with timing
 */
async function run() {
  console.log(`\n  AniNewsAPI v${APP_VERSION} Tests\n${'='.repeat(50)}\n`);
  let passed = 0, failed = 0;

  /**
   * Execute a single test case.
   *
   * @param {string} name - Test display name
   * @param {string} url - Full URL to request
   * @param {Function|null} validate - Validation function (returns true or error string)
   * @param {Object} opts - Additional axios options
   */
  async function test(name, url, validate, opts = {}) {
    process.stdout.write(`  ${name} ... `);
    try {
      const r = await axios.get(url, { timeout: 60000, validateStatus: () => true, ...opts });
      if (validate) {
        const v = validate(r);
        if (v !== true) { console.log(`FAIL ${v}`); failed++; return; }
      }
      console.log(`PASS (${r.data?.responseTime || r.headers?.['x-response-time'] || '-'})`);
      passed++;
    } catch (e) {
      console.log(`FAIL ${e.response?.status || e.message}`);
      failed++;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CORE ENDPOINTS
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: Health & stats tests ----
  await test('Health', `${BASE_URL}/api/health`,
    r => r.data.version === APP_VERSION ? true : `version mismatch: ${r.data.version}`);
  await test('Stats', `${BASE_URL}/api/stats`,
    r => r.data.success ? true : 'not successful');

  // ══════════════════════════════════════════════════════════════
  // NEWS ENDPOINT
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: News endpoint tests ----
  await test('News (all)', `${BASE_URL}/api/news?limit=3&refresh=true`,
    r => r.data.data?.length > 0 ? true : 'no articles');

  // Per-source filtering
  for (const s of ['ann', 'crunchyroll', 'myanimelist', 'animecorner', 'otakuusa', 'animeherald', 'comicbook', 'tokyootakumode', 'animetrending', 'animeuknews', 'randomcuriosity', 'honeysanime', 'otakunewsnew']) {
    await test(`News (${s})`, `${BASE_URL}/api/news?source=${s}&limit=2`,
      r => r.data.meta?.source === s ? true : 'source mismatch');
  }

  // Pagination
  await test('Pagination', `${BASE_URL}/api/news?offset=2&limit=3`,
    r => r.data.meta?.offset === 2 ? true : 'offset mismatch');

  // Sorting
  await test('Sort oldest', `${BASE_URL}/api/news?sort=oldest&limit=2`,
    r => r.data.meta?.sort === 'oldest' ? true : 'sort mismatch');

  // HEAD support
  await test('HEAD /api/news', `${BASE_URL}/api/news`,
    r => r.status === 200 ? true : `expected 200, got ${r.status}`,
    { method: 'HEAD' });

  // Error cases
  await test('Invalid source -> 400', `${BASE_URL}/api/news?source=fake`,
    r => r.status === 400 ? true : `expected 400, got ${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // TAGS ENDPOINT
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: Tags endpoint tests ----
  await test('Tags', `${BASE_URL}/api/news/tags`,
    r => r.data.data?.tags ? true : 'no tags');

  // ══════════════════════════════════════════════════════════════
  // SEARCH ENDPOINT
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: Search endpoint tests ----
  await test('Search', `${BASE_URL}/api/search?q=anime&limit=3`,
    r => r.data.meta?.query === 'anime' ? true : 'query mismatch');
  await test('Search too short -> 400', `${BASE_URL}/api/search?q=a`,
    r => r.status === 400 ? true : `expected 400, got ${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // RSS ENDPOINT
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: RSS endpoint tests ----
  await test('RSS', `${BASE_URL}/api/rss?limit=3`,
    r => r.data.includes('<rss') ? true : 'not RSS');
  await test('RSS (crunchyroll)', `${BASE_URL}/api/rss?source=crunchyroll&limit=2`,
    r => r.data.includes('Crunchyroll') ? true : 'no Crunchyroll');

  // ══════════════════════════════════════════════════════════════
  // OTHER ENDPOINTS
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: SSE, OpenAPI, landing tests ----
  await test('SSE Stream', `${BASE_URL}/api/stream`,
    r => r.data.includes('"connected"') ? true : 'no connected event');
  await test('OpenAPI spec', `${BASE_URL}/api/openapi`,
    r => r.data.openapi === '3.0.3' ? true : 'not openapi 3.0.3');

  // Landing page
  await test('Landing page', `${BASE_URL}/`,
    r => r.status === 200 && r.headers['content-type']?.includes('html') ? true : 'not HTML');

  // 404 handling
  await test('404 JSON', `${BASE_URL}/api/nonexistent`,
    r => r.status === 404 && r.data.error === 'Not found' ? true : 'bad 404');

  // ══════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════

  // ---- FEATURE: Test results summary ----
  console.log(`\n${'='.repeat(50)}\n  ${passed} passed, ${failed} failed\n${'='.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });

// ══════════════════════════════════════════════════════════════ END: test.js
