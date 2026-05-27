# 📋 Changelog

All notable changes to **AniNewsAPI** will be documented in this file.

---

## [4.2.2] - 2026-05-28

### Fixed
- **TOS & Privacy routes restored**: Re-added `/tos` → `/tos.html` and `/privacy` → `/privacy.html` rewrites in `vercel.json` that were lost during restructuring — pages now load correctly on Vercel

---

## [4.2.1] - 2026-05-28

### Changed
- **README.md overhaul**: Upgraded to WaifuWiki-style comprehensive documentation — added Table of Contents, detailed Overview with ASCII architecture diagram, Feature Highlights table, News Sources with fetch strategies, full API reference with collapsible examples, API Response Schema, Caching Architecture diagram, Source Fetch Strategy table, Troubleshooting table, FAQ (8 collapsible entries), Roadmap, Contributing guide, Star History, and Author section

---

## [4.2.0] - 2026-05-28

### Changed
- **Code style overhaul**: Restructured all 26 source files with AlisaReactionBot-style documentation — box-style headers (project, author, license), section markers (`// ═══ SECTION ═══`), feature markers (`// ---- FEATURE: XYZ ----`), function-level JSDoc with @param/@returns, inline notes for non-obvious logic, and module footers
- **Consistent documentation**: Every utility, API endpoint, fetcher, and entry file now follows the same structured format for improved readability and grep-ability

---

## [4.1.6] - 2026-05-27

### Fixed
- **Full excerpts, no truncation**: Removed 200-char `substring(0, 200)` limit from all 7 fetchers — excerpts now show complete descriptions
- **No more fake excerpts**: Removed `${title.slice(0, 120)}...` fallback from all fetchers and news.js — empty excerpt stays empty instead of showing truncated title as description

---

## [4.1.5] - 2026-05-27

### Fixed
- **Comic Book excerpts now real descriptions**: Added `.wp-block-savage-platform-post-subheadline` selector — articles now show actual descriptions like "The studio behind Solo Leveling..." instead of just the title
- **Anime Corner excerpts**: Switched to RSS-first (has `contentSnippet` with real descriptions) instead of web scraping which lacked excerpts
- **Anime Herald excerpts**: Same RSS-first fix — articles now show real interview/preview text instead of title fallback
- **Comic Book selectors**: Added `.wp-block-wp-curate-post-title a` and `.wp-block-post` for better element matching

---

## [4.1.4] - 2026-05-27

### Fixed
- **Sources endpoint live health checks**: Rewrote `/api/sources` to perform real-time fetches against each source instead of relying on in-memory metrics that don't persist across Vercel serverless function boundaries. Now returns actual article counts, latency, and health status per source

---

## [4.1.3] - 2026-05-27

### Fixed
- **Source metrics always zero on Vercel**: `sourceMetrics` was in-memory only, reset on every serverless cold start. Now persisted to disk (`_source_metrics.json`) so `/api/sources` returns real data across invocations
- **Flush clears metrics**: `POST /api/cache/clear` now also resets in-memory source metrics

---

## [4.1.2] - 2026-05-27

### Updated
- **README.md overhaul**: Updated to reflect all v4.1.0+ features — date range filtering, cursor pagination, source health endpoint, cache clear auth, security headers, centralized source registry
- Fixed endpoint count from 11 to 12 (added `/api/sources`)
- Added `CACHE_CLEAR_KEY` to configuration table
- Added `sources.js` to project structure
- Updated "Add a New Source" guide to reference `utils/sources.js`
- Removed emoji from headings for cleaner rendering

---

## [4.1.1] - 2026-05-27

### Fixed
- **Excerpt duplication bug**: MAL excerpts were returning title text instead of actual article descriptions. Root cause: generic `p` CSS selector in excerpt extraction matched `<p class="title">` before `<div class="text">`. Fixed in `fetchMyAnimeList.js` and all other fetchers (AnimeCorner, AnimeHerald, ComicBook, Crunchyroll, OtakuNews) that had the same `p` fallback risk
- **Greedy selector in MAL fetcher**: Removed `[class*="news"]` selector that matched child elements (`.news-unit-right`) causing duplicate processing

---

## [4.1.0] - 2026-05-27

### Added
- **Date range filtering**: `GET /api/news?from=YYYY-MM-DD&to=YYYY-MM-DD` and `GET /api/search?from=&to=` — filter articles by publication date range
- **Cursor-based pagination**: `GET /api/news?cursor=<encoded>` — opaque cursor returned in `meta.nextCursor` for efficient forward pagination (backwards compatible with `offset`)
- **Source health endpoint**: `GET /api/sources` — per-source health status (healthy/degraded/unknown), article count, last fetch time, and error tracking
- **Source tracking in cacheHandler**: `trackSource()` and `getSourceMetrics()` methods for monitoring fetch results across all 7 news sources

### Updated
- **OpenAPI spec**: Added `from`, `to`, `cursor` parameters to `/api/news`; `from`, `to` to `/api/search`; new `/api/sources` path
- **Landing page**: Added `/api/sources` endpoint card and playground dropdown option
- **index.js**: Added `/api/sources` to Vercel landing page endpoint list
- **404 handler**: Added `/api/sources` to availableEndpoints list

---

## [4.0.8] - 2026-05-27

### Fixed
- **Version drift**: Synced `APP_VERSION` in `constants.js`, `package.json`, `openapi.js`, and `README.md` badges to `4.0.8`
- **`vercel.json` misleading headers**: Removed hardcoded `X-RateLimit-Remaining: 99` that always showed 99 regardless of actual usage
- **Rate limiter broken behind proxy**: Added `trust proxy` setting so `req.ip` returns the real client IP behind Vercel/CDN
- **Dead route removed**: Removed redundant `app.get('/')` handler in `server.js` — `express.static('public')` already serves the landing page
- **README Node.js badge**: Fixed badge from `>=18` to `>=20` to match `package.json` engines field
- **README version badge**: Updated from `4.0.0` to `4.0.8`
- **Sitemap `lastmod`**: Updated from stale `2026-05-08` to `2026-05-27`

### Added
- **Centralized source registry**: Created `utils/sources.js` — single source of truth for all 7 news source definitions, eliminating triple duplication across `api/news.js`, `api/search.js`, `api/rss.js`
- **Cache clear authentication**: `POST /api/cache/clear` now requires `X-Api-Key` header when `CACHE_CLEAR_KEY` env var is set — prevents unauthorized cache flushing
- **Security headers**: Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` to all API responses
- **Content-Security-Policy**: Added CSP meta tag to landing page restricting resources to trusted domains
- **OpenAPI in robots.txt**: Allowed `/api/openapi` path so API spec is discoverable by crawlers

### Improved
- **Shared constants in fetchers**: All 7 fetcher modules and `contentParser.js` now use `USER_AGENT` and `REQUEST_TIMEOUT`/`CONTENT_TIMEOUT` from `constants.js` instead of hardcoded strings
- **Health endpoint**: Removed `process.memoryUsage()` leak — no longer exposes internal memory details to API consumers

---

## [4.0.7] - 2026-05-08

### Added
- **Full OG Meta Stack**: Enhanced Open Graph tags with `og:image:secure_url`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt` for optimal social media previews
- **OG namespace prefix**: Added `prefix="og: https://ogp.me/ns#"` to `<html>` tag for proper OG validation
- **Twitter Card enhancements**: Added `twitter:domain`, `twitter:site`, and `twitter:image:alt` for richer Twitter/X link previews
- **JSON-LD image field**: Added `image` property to structured data for better search engine rich results

---

## [4.0.6] - 2026-05-08

### Added
- **`CONTRIBUTING.md`**: Complete guide covering bug reports, feature requests, code contributions, how to add a new news source (with code template), commit conventions, testing, and project structure.
- **PWA manifest** (`/manifest.json`): Installable as a standalone app with branded icon, dark theme, and "developer" + "news" categories.
- **Custom OG image** (`/og-image.png`): Branded 1200×630 image with logo, title, subtitle, and stat pills — replaces GitHub's auto-generated card.
- **GitHub stats localStorage cache**: Stats are cached for 30 minutes. Cached values render instantly, then refresh in background. Eliminates redundant GitHub API calls on repeat visits.

---

## [4.0.5] - 2026-05-08

### Fixed
- **Node engine**: Updated from `>=18.x` (EOL April 2025) to `>=20.x`
- **RSS auto-discovery**: Added `<link rel="alternate" type="application/rss+xml">` to landing page `<head>` so browsers and feed readers can detect the RSS feed
- **Test suite overhaul**: Updated `test.js` to use dynamic version from constants, added tests for SSE stream, OpenAPI spec, landing page, 404 handler, sort parameter, and error cases

---

## [4.0.4] - 2026-05-08

### Added
- **Terms of Service page** (`/tos`): Full legal terms covering usage, content ownership, disclaimers, and liability limits.
- **Privacy Policy page** (`/privacy`): Data collection transparency — covers IP rate limiting, no cookies, no analytics, no PII, data retention policies, and third-party source links.
- **Footer legal links**: Added Terms and Privacy links in the landing page footer.

---

## [4.0.3] - 2026-05-08

### Fixed
- **SSE timeout crash**: `/api/stream` used `setInterval` which exceeds Vercel's 10s function timeout. Replaced with single-burst response that sends status + heartbeat + info then closes.
- **Playground hardcoded URL**: Try-It-Live panel now uses `window.location.origin` instead of hardcoded `https://aninews.vercel.app`, enabling local dev testing.

### Added
- **`robots.txt`**: Served at `/robots.txt` allowing all crawlers, disallowing `/api/`, with sitemap reference.
- **`sitemap.xml`**: Served at `/sitemap.xml` with main page, features, docs, and sources sections.
- **Actual rate limiting**: In-memory per-IP rate limiter (100 req/min) on all `/api` routes. Returns 429 with `retryAfter` when exceeded. Buckets auto-clean every 5 minutes.
- **Landing page memory cache**: `index.js` now caches `index.html` in memory and only re-reads from disk when file mtime changes.

---

## [4.0.2] - 2026-05-08

### Fixed
- **CRITICAL: Vercel FUNCTION_INVOCATION_FAILED crash**: `cacheHandler.js` used `fs.mkdirSync` on a read-only filesystem at module load time. On Vercel serverless, only `/tmp` is writable. Now detects serverless environment and uses `/tmp/aninews-cache` instead. Wrapped directory creation in try-catch.
- **Removed legacy `builds` from `vercel.json`**: Modern Vercel auto-detects `api/` routes. The `builds` config was conflicting with zero-config mode.

---

## [4.0.1] - 2026-05-08

### Changed
- **README At a Glance**: Replaced ASCII art with markdown table grid showing key metrics
- **README Architecture**: Replaced ASCII flowchart with three markdown tables — request flow, endpoints, and sources

---

## [4.0.0] - 2026-05-08

### Added
- **Try It Live Playground** (`#tryit`): Interactive panel on landing page to test any API endpoint directly from the browser with syntax-highlighted JSON responses
- **Live Article Preview**: Landing page now fetches and displays 6 real articles from `/api/news` on page load — actual data, not mockups
- **Server-Sent Events** (`/api/stream`): SSE endpoint for real-time article push notifications with 30s heartbeat keep-alive
- **OpenAPI 3.0 Specification** (`/api/openapi`): Machine-readable API spec for Swagger UI, Postman, and auto-generated clients
- **Rate Limit Headers**: All API responses now include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers
- **404 HTML Page**: Browser requests to unknown routes get a styled dark 404 page; API clients still get JSON
- **JSON-LD Structured Data**: Added `SoftwareApplication` schema markup for Google rich results
- **`<noscript>` Fallback**: Graceful degradation banner when JavaScript is disabled
- **GitHub API Preconnect**: `<link rel="preconnect" href="https://api.github.com">` for faster stats loading
- **`color-scheme: dark` Meta**: Prevents white flash on page load in dark mode browsers

### Changed
- **Version Bump**: 3.1.3 → 4.0.0 across package.json, constants, test, README, and landing page
- **GitHub Stats Error Handling**: Live stats now show fallback values (300+, 45+) instead of "—" when GitHub API is unreachable
- **README Architecture Diagram**: Updated to include `/api/stream` (SSE) and `/api/openapi` (JSON spec) endpoints
- **README At a Glance**: Endpoint count updated from 9 to 11
- **README Project Structure**: Added `stream.js` and `openapi.js` to file tree

---

## [3.1.4] - 2026-05-08

### Fixed
- **README "At a Glance"**: Updated version from 3.0.0 to 3.1.3, corrected endpoint count from 8 to 9
- **README Architecture diagram**: Added missing `/api/health` and `/api/cache/clear` endpoints to the data flow diagram
- **Version consistency**: Bumped version to 3.1.3 across `package.json`, `utils/constants.js`, and `test.js`

---

## [3.1.3] - 2026-05-08

### Fixed
- **Auto-updating copyright year**: Footer now dynamically sets year via `new Date().getFullYear()` instead of hardcoded "2025"

---

## [3.1.2] - 2026-05-08

### Changed
- **Replaced all emoji icons with proper SVG icons**: Logo marks (header, footer, favicon) now use inline SVG newspaper icon instead of 📰 emoji
- **Live GitHub Stats**: Stats ribbon now shows real-time stars, forks from GitHub API; hero badge shows live version from `package.json`
- **Live CTA Stats**: GitHub section now fetches and displays live stars, forks, and contributor count via GitHub API

---

## [3.1.1] - 2026-05-08

### Added
- **README Notice**: Added deprecation notice for old URL `https://aninewsapi.vercel.app/` — no longer accessible, directing users to current `https://aninews.vercel.app/`

---

## [3.1.0] - 2026-05-08

### Changed
- **Frontend Complete Redesign** (`public/index.html`): Rebuilt landing page from scratch with a modern, distinctive aesthetic
  - Switched from Inter/JetBrains Mono to **Space Grotesk / Space Mono** font pairing for sharper visual identity
  - Replaced Catppuccin color scheme with a **violet/pink/cyan accent palette** on a deep dark base (`#0a0a0f`)
  - Added **ambient floating orb background** with blur and infinite float animation for depth
  - Added **noise texture overlay** via inline SVG for subtle grain
  - Introduced **glassmorphism sticky header** with `backdrop-filter: blur(20px) saturate(1.5)`
  - Redesigned hero with **animated gradient shimmer** on headline, status badge with live pulse dot, and **interactive terminal preview** showing a live `curl` response with blinking cursor
  - Replaced stat cards with a **stats ribbon** using a 1px-gap grid layout and color-coded numbers
  - Replaced feature card grid with **borderless grid** using top-border reveal animation on hover
  - Replaced documentation endpoint blocks with **collapsible accordion cards** — click to expand/collapse details
  - Added **sources grid** with per-source cards showing scrape method badges (RSS / Scrape)
  - Redesigned CTA section with a **gradient-topped card** and metadata row (stars, contributors, license)
  - Replaced footer with a **compact single-row layout** with social icon buttons
  - Added **scroll-reveal animations** via IntersectionObserver for progressive content loading
  - Improved **mobile responsiveness** with hamburger toggle, stacked grids, and fluid typography via `clamp()`
  - Reduced external dependencies: removed Font Awesome heavy load, kept only icon subset needed

---

## [3.0.0] - 2026-05-08

### Added
- **Keyword Search** (`/api/search`): Full-text search across all articles with relevance scoring and pagination
- **RSS Feed** (`/api/rss`): Standard RSS 2.0 XML output for feed readers and automated integrations
- **Pagination**: Added `offset` query parameter to `/api/news` for cursor-based pagination
- **Cross-Source Deduplication**: Duplicate articles across sources are automatically removed by normalized title matching
- **`.gitignore`**: Added to exclude cache files, data, node_modules, and environment files from version control
- **Constants Module** (`utils/constants.js`): Centralized configuration for version, limits, timeouts, user agent, and CORS headers
- **Tag Counts**: `/api/news/tags` now returns article count per tag, sorted by popularity
- **CORS Preflight**: All API endpoints now handle OPTIONS preflight requests in code
- **Favicon**: SVG emoji favicon (📰) with Apple Touch Icon support
- **Open Graph Meta**: Full OG tags for Facebook/social media link previews
- **Twitter Cards**: Large image card with title, description, and preview
- **SEO Metadata**: Canonical URL, keywords, robots, theme-color, apple-mobile-web-app tags
- **README Overhaul**: Complete rewrite with architecture diagram, feature matrix, structured endpoint docs, and project structure

### Changed
- **Crunchyroll Source**: Switched from blocked RSS/web scraping to Google News RSS proxy (`site:crunchyroll.com/news`) — now returns 15 articles reliably
- **ANN Source**: Added Google News RSS fallback — now returns 15 articles when direct access is blocked by Cloudflare
- **OtakuUSA Source**: Added Google News RSS fallback — now returns 12 articles when direct access returns 520 errors
- **Version Bump**: 2.0.0 → 3.0.0 across package.json, constants, health endpoint, README, and landing page
- **Landing Page**: Updated hero text to list all 7 sources instead of just "Crunchyroll & ANN"
- **Landing Page**: Fixed stats section showing "5 sources" → "7 sources"
- **Landing Page**: Added Search and RSS feature cards and endpoint docs
- **Health Endpoint**: Now reports `name` and `version` from centralized constants
- **CORS Headers**: Now set in API code via constants module (in addition to vercel.json)

### Removed
- **`utils/cacheNews.js`**: Deleted unused legacy ESM module that was never imported by any API endpoint
- **Unused dependencies**: Removed `puppeteer-core`, `xml2js`, and `@vercel/node` from package.json (never imported)

### Fixed
- **server.js**: Updated to use centralized constants, mount all new endpoints (/api/search, /api/rss), and add CORS middleware
- **test.js**: Rewritten to test all 14 endpoints including search, RSS, pagination, and per-source filtering
- **Response Metadata**: `/api/news` now returns `returned` count and `hasMore` boolean for pagination clarity
- **Tag Sorting**: Tags are now sorted by article count (most popular first) instead of alphabetical

---

## [2.0.0] - 2025-04-13

### Added
- **2 New Sources**: Anime Herald and Comic Book (7 total sources)
- **Date Parser**: Advanced date parsing for relative times ("2 hours ago", "Yesterday", etc.)
- **RSS Fallback**: All sources now have RSS feed fallback when web scraping fails
- **Health Check**: `/api/health` endpoint for system monitoring
- **Statistics**: `/api/stats` endpoint for cache hit/miss metrics
- **Cache Clear**: `POST /api/cache/clear` endpoint to manually flush cache
- **Force Refresh**: `?refresh=true` query parameter to bypass cache
- **Retry Logic**: Concurrent fetching with exponential backoff (3 attempts per source)
- **Disk Cache**: File-system backup cache when memory cache expires
- **Landing Page**: Full documentation page with feature cards and endpoint reference

---

## [1.0.0] - 2025-01-01

### Added
- Initial release with 5 sources: ANN, Anime Corner, MyAnimeList, Otaku USA, Crunchyroll
- News endpoint, tag filtering, article content by slug
- Smart caching with 15-minute TTL
- Cheerio web scraping with Vercel deployment
