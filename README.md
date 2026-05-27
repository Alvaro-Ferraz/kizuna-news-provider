
> [!NOTE]
> The old deployment URL `https://aninewsapi.vercel.app/` is no longer accessible. Use the current URL: **https://aninews.vercel.app/**

<div align="center">

# 📰 AniNewsAPI

**Real-time Anime News Aggregation API**

![Vercel](https://img.shields.io/badge/Deployed%20On-Vercel-black?logo=vercel&style=flat-square)
![Version](https://img.shields.io/badge/Version-4.1.2-89b4fa?style=flat-square&labelColor=1e1e2e)
![Node](https://img.shields.io/badge/Node.js-≥20-339933?logo=node.js&style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Sources](https://img.shields.io/badge/Sources-7-f5c2e7?style=flat-square&labelColor=1e1e2e)
![Status](https://img.shields.io/badge/API-Stable-a6e3a1?style=flat-square&labelColor=1e1e2e)

[![API Status](https://img.shields.io/website?down_color=f38ba8&down_message=offline&label=API&style=for-the-badge&up_color=a6e3a1&up_message=online&url=https%3A%2F%2Faninews.vercel.app)](https://aninews.vercel.app)
![Last Commit](https://img.shields.io/github/last-commit/Shineii86/AniNewsAPI?style=for-the-badge)
![Repo Size](https://img.shields.io/github/repo-size/Shineii86/AniNewsAPI?style=for-the-badge)
[![Stars](https://img.shields.io/github/stars/Shineii86/AniNewsAPI?style=for-the-badge)](https://github.com/Shineii86/AniNewsAPI/stargazers)
[![Forks](https://img.shields.io/github/forks/Shineii86/AniNewsAPI?style=for-the-badge)](https://github.com/Shineii86/AniNewsAPI/fork)

> A serverless API aggregating anime news from **7 sources** in real-time — with smart caching, keyword search, RSS feeds, date filtering, cursor pagination, and source health monitoring.

<br>

[🚀 Quick Start](#-quick-start) · [📡 API Docs](#-api-endpoints) · [🗞️ Sources](#️-news-sources) · [🏗️ Architecture](#️-architecture) · [🤝 Contributing](#-contributing)

</div>

---

## 📊 At a Glance

<table>
<tr>
<td align="center" width="25%"><strong>📡 7 Sources</strong><br><sub>ANN · MAL · Crunchyroll<br>Anime Corner · Otaku USA<br>Anime Herald · Comic Book</sub></td>
<td align="center" width="25%"><strong>⚡ 12 Endpoints</strong><br><sub>News · Search · RSS · SSE<br>Tags · Slug · Sources<br>Health · Stats · OpenAPI</sub></td>
<td align="center" width="25%"><strong>🚀 ~200ms</strong><br><sub>Cached responses<br>10-min auto-refresh<br>Cross-source dedup</sub></td>
<td align="center" width="25%"><strong>📰 60+ Articles</strong><br><sub>Full-text search<br>Date range filtering<br>Cursor pagination</sub></td>
</tr>
</table>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### ⚡ Core
- **Real-time scraping** from 7 anime news sources
- **Smart caching** with 10-minute TTL + disk backup
- **Concurrent fetching** — all sources hit simultaneously
- **Retry logic** — 3 attempts per source with exponential backoff
- **Graceful degradation** — if a source fails, others continue

</td>
<td width="50%">

### 🔍 Data
- **Keyword search** with relevance scoring (`/api/search`)
- **Date range filtering** — `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Cursor pagination** — opaque `nextCursor` for efficient paging
- **RSS 2.0 feed** for readers & integrations (`/api/rss`)
- **Full article extraction** by slug (`/api/news/:slug`)
- **Tag filtering** with article counts (`/api/news/tags`)

</td>
</tr>
<tr>
<td width="50%">

### 🛡️ Reliability
- **RSS fallback** when web scraping is blocked
- **Google News proxy** for Cloudflare-protected sources
- **Cross-source deduplication** by normalized title
- **Timeout protection** — 15s per source, never hangs
- **CORS enabled** — works from any frontend
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options

</td>
<td width="50%">

### 📊 Monitoring
- **Source health** — per-source status, article count, fetch tracking (`/api/sources`)
- **Cache statistics** — hit/miss metrics (`/api/stats`)
- **Health check** — uptime, version, node info (`/api/health`)
- **Cache clear auth** — API key protected (`CACHE_CLEAR_KEY` env)
- **SSE stream** — real-time article push (`/api/stream`)

</td>
</tr>
<tr>
<td width="50%">

### 🚀 Deployment
- **Zero-config** Vercel deployment
- **Serverless functions** — scales automatically
- **Express mode** — run standalone with `npm start`
- **Environment variables** for TTL customization
- **~50KB** total codebase, no heavy dependencies

</td>
<td width="50%">

</td>
</tr>
</table>

---

## 🗞️ News Sources

| Source | Key | Method | Articles |
|--------|-----|--------|----------|
| [**Anime News Network**](https://www.animenewsnetwork.com/) | `ann` | Google News RSS | ~15 |
| [**Anime Corner**](https://animecorner.me/) | `animecorner` | Direct Scraping | ~12 |
| [**MyAnimeList**](https://myanimelist.net/) | `myanimelist` | Direct Scraping | ~15 |
| [**Otaku USA Magazine**](https://otakuusamagazine.com/) | `otakuusa` | Google News RSS | ~12 |
| [**Crunchyroll**](https://www.crunchyroll.com/news) | `crunchyroll` | Google News RSS | ~15 |
| [**Anime Herald**](https://www.animeherald.com/) | `animeherald` | RSS Feed | ~10 |
| [**Comic Book**](https://comicbook.com/anime/) | `comicbook` | Direct Scraping | ~10 |

> **Total: 60+ unique articles** after cross-source deduplication

---

## 🏗️ Architecture

**Request Flow**

| Stage | Component | Description |
|:-----:|-----------|-------------|
| 1 | **Client** | Browser, app, or `curl` sends request |
| 2 | **Vercel Edge / Express** | Routes request, applies CORS + security headers + rate limit |
| 3 | **Cache Check** | `node-cache` with 10-min TTL — hit = instant response |
| 4 | **Fetch Sources** | 7 concurrent scrapers (3 retries each, 15s timeout) |
| 5 | **Deduplicate** | Cross-source dedup by normalized title |
| 6 | **Enrich & Respond** | Filter, paginate, sort, format → JSON/RSS/SSE |

**Endpoints**

| Endpoint | Method | Description |
|----------|:------:|-------------|
| `/api/news` | GET | Latest news with pagination, sorting, source filtering, date range, cursor |
| `/api/news/tags` | GET | Tag listing with counts, or filter by tag |
| `/api/news/:slug` | GET | Full article content extraction |
| `/api/search` | GET | Full-text search with relevance scoring + date filtering |
| `/api/sources` | GET | Per-source health status, article counts, fetch tracking |
| `/api/rss` | GET | RSS 2.0 XML feed |
| `/api/health` | GET | Status, version, uptime |
| `/api/stats` | GET | Cache hit/miss metrics |
| `/api/stream` | GET | Server-Sent Events for real-time push |
| `/api/openapi` | GET | OpenAPI 3.0.3 specification |
| `/api/cache/clear` | POST | Manual cache flush (requires API key) |

---

## 📡 API Endpoints

### `GET /api/news`

Latest anime news from all or specific sources.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `1-100` | `20` | Max articles |
| `offset` | `≥0` | `0` | Pagination offset |
| `cursor` | `string` | — | Pagination cursor (from `meta.nextCursor`) |
| `sort` | `latest\|oldest` | `latest` | Sort order |
| `source` | `string` | `all` | Filter by source key |
| `from` | `YYYY-MM-DD` | — | Start date filter |
| `to` | `YYYY-MM-DD` | — | End date filter |
| `refresh` | `boolean` | `false` | Bypass cache |

```bash
# Basic usage
curl "https://aninews.vercel.app/api/news?limit=10"

# Filter by source with pagination
curl "https://aninews.vercel.app/api/news?source=crunchyroll&limit=10&offset=10"

# Date range filtering
curl "https://aninews.vercel.app/api/news?from=2026-05-20&to=2026-05-27"

# Cursor-based pagination (use nextCursor from previous response)
curl "https://aninews.vercel.app/api/news?limit=20&cursor=eyJvZmZzZXQiOjIwfQ"
```

<details>
<summary>📄 Example Response</summary>

```json
{
  "success": true,
  "data": [{ "title": "Demon Slayer Season 4 Announced", "slug": "ann-demon-slayer-season-4-announced", "source": "Anime News Network", "excerpt": "The official website confirmed...", "date": "2026-05-27T10:30:00.000Z", "image": "...", "link": "...", "tags": ["news", "anime"] }],
  "meta": { "total": 62, "returned": 10, "offset": 0, "limit": 10, "hasMore": true, "nextCursor": "eyJvZmZzZXQiOjEwfQ", "source": "all", "sort": "latest", "from": "2026-05-20", "to": "2026-05-27", "responseTime": "234ms" }
}
```
</details>

---

### `GET /api/search`

Full-text search with relevance scoring. Title matches rank higher than excerpt matches.

| Param | Required | Description |
|-------|----------|-------------|
| `q` | Yes | Search query (min 2 chars) |
| `source` | No | Filter by source |
| `limit` | No | Max results |
| `offset` | No | Pagination |
| `from` | No | Start date (YYYY-MM-DD) |
| `to` | No | End date (YYYY-MM-DD) |

```bash
curl "https://aninews.vercel.app/api/search?q=demon+slayer"
curl "https://aninews.vercel.app/api/search?q=manga&source=ann&limit=5"
curl "https://aninews.vercel.app/api/search?q=crunchyroll&from=2026-05-20&to=2026-05-27"
```

---

### `GET /api/sources`

Per-source health monitoring. Returns fetch status, article counts, and last fetch time for each news source.

```bash
curl "https://aninews.vercel.app/api/sources"
```

<details>
<summary>📄 Example Response</summary>

```json
{
  "success": true,
  "data": [
    { "key": "ann", "name": "Anime News Network", "fetchCount": 5, "lastFetch": "2026-05-27T12:00:00.000Z", "articleCount": 15, "lastError": null, "status": "healthy" },
    { "key": "myanimelist", "name": "MyAnimeList", "fetchCount": 3, "lastFetch": "2026-05-27T11:55:00.000Z", "articleCount": 15, "lastError": null, "status": "healthy" }
  ],
  "meta": { "total": 7, "healthy": 7, "degraded": 0, "responseTime": "2ms" }
}
```
</details>

---

### `GET /api/news/tags`

List available tags with counts, or filter articles by tag.

```bash
curl "https://aninews.vercel.app/api/news/tags"
curl "https://aninews.vercel.app/api/news/tags?tag=official"
```

---

### `GET /api/news/:slug`

Full article content extraction.

```bash
curl "https://aninews.vercel.app/api/news/ann-demon-slayer-season-4-announced"
```

---

### `GET /api/rss`

Standard RSS 2.0 XML feed. Works with any feed reader.

| Param | Default | Description |
|-------|---------|-------------|
| `source` | `all` | Filter by source |
| `limit` | `20` | Max items |

```bash
curl "https://aninews.vercel.app/api/rss"
curl "https://aninews.vercel.app/api/rss?source=crunchyroll&limit=10"
```

---

### `GET /api/health` · `GET /api/stats` · `POST /api/cache/clear`

Health check, cache statistics, and manual cache flush.

The cache clear endpoint requires an API key when `CACHE_CLEAR_KEY` is set:

```bash
curl -X POST "https://aninews.vercel.app/api/cache/clear" -H "X-Api-Key: your-secret-key"
```

---

### `GET /api/stream`

Server-Sent Events (SSE) stream for real-time article notifications. Clients receive `new_article` events as they're fetched and `heartbeat` events every 30s to keep the connection alive.

```bash
curl -N "https://aninews.vercel.app/api/stream"
```

---

### `GET /api/openapi`

OpenAPI 3.0.3 specification in JSON format. Use with Swagger UI, Postman, or any OpenAPI-compatible tool.

```bash
curl "https://aninews.vercel.app/api/openapi"
```

---

## 🚀 Quick Start

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Shineii86/AniNewsAPI)

### Local Development

```bash
git clone https://github.com/Shineii86/AniNewsAPI.git
cd AniNewsAPI && npm install && npm run dev
# → http://localhost:3000
```

---

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_TTL` | `600` | Cache duration in seconds |
| `PORT` | `3000` | Server port (Express mode) |
| `CACHE_CLEAR_KEY` | — | API key for `POST /api/cache/clear` (optional) |

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| Cached response | ~200ms |
| Fresh fetch (all 7) | ~3-6s |
| Cache TTL | 10 minutes |
| Retry attempts | 3 per source |
| Timeout per source | 15 seconds |
| Total articles (avg) | 60+ after dedup |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js >= 20 |
| **HTTP** | Express 5 / Vercel Functions |
| **Scraping** | Cheerio + Axios |
| **RSS** | rss-parser |
| **Caching** | node-cache + filesystem |

---

## 📁 Project Structure

```
AniNewsAPI/
├── api/                    # Vercel serverless functions
│   ├── cache/clear.js      # Cache management (API key protected)
│   ├── health.js           # Health check
│   ├── news.js             # Main news endpoint (date filter, cursor)
│   ├── news/{slug}.js      # Article by slug
│   ├── news/tags.js        # Tag filtering
│   ├── rss.js              # RSS feed
│   ├── search.js           # Keyword search (date filter)
│   ├── sources.js          # Per-source health & stats
│   ├── stats.js            # Cache statistics
│   ├── stream.js           # SSE real-time feed
│   └── openapi.js          # OpenAPI 3.0 spec
├── utils/                  # Core logic
│   ├── cacheHandler.js     # Memory + disk cache + source tracking
│   ├── constants.js        # Shared config
│   ├── contentParser.js    # Article extraction
│   ├── dateParser.js       # Multi-format date parsing
│   ├── fetch*.js           # Source scrapers (7 files)
│   ├── generateSlug.js     # URL-safe slug generator
│   └── sources.js          # Centralized source registry
├── public/index.html       # Landing page
├── server.js               # Express server entry
├── test.js                 # Test suite
├── vercel.json             # Vercel routing config
└── CHANGELOG.md
```

---

## 🤝 Contributing

### Add a New Source

1. Create `utils/fetchNewSource.js` — export async function returning `[{ title, slug, source, excerpt, date, image, link, tags }]`
2. Register in `utils/sources.js` → `SOURCES` object
3. Test with `npm test`, submit a PR

---

## 📄 License

[MIT](LICENSE) © [Shinei Nouzen](https://github.com/Shineii86)

---

## 🙏 Acknowledgments

| Source | About |
|--------|-------|
| [Anime News Network](https://www.animenewsnetwork.com/) | Industry-leading anime journalism |
| [Anime Corner](https://animecorner.me/) | Community-driven anime news & polls |
| [MyAnimeList](https://myanimelist.net/) | The largest anime/manga database |
| [Otaku USA Magazine](https://otakuusamagazine.com/) | English-language anime culture magazine |
| [Crunchyroll](https://www.crunchyroll.com/news) | Official streaming platform news |
| [Anime Herald](https://www.animeherald.com/) | Anime news, reviews & editorials |
| [Comic Book](https://comicbook.com/anime/) | Anime & manga coverage at ComicBook |

---

<div align="center">

**Built with ❤️ for the anime community**

[![Telegram](https://img.shields.io/badge/-Telegram-2CA5E0?style=flat&logo=Telegram&logoColor=white)](https://telegram.me/Shineii86)
[![GitHub](https://img.shields.io/badge/-GitHub-181717?style=flat&logo=github&logoColor=white)](https://github.com/Shineii86)
[![Instagram](https://img.shields.io/badge/-Instagram-C13584?style=flat&logo=Instagram&logoColor=white)](https://instagram.com/ikx7.a)
[![Gmail](https://img.shields.io/badge/-Gmail-D14836?style=flat&logo=Gmail&logoColor=white)](mailto:ikx7a@hotmail.com)

⭐ [Star this repo](https://github.com/Shineii86/AniNewsAPI) · 🐛 [Report a bug](https://github.com/Shineii86/AniNewsAPI/issues) · 💡 [Request a feature](https://github.com/Shineii86/AniNewsAPI/issues)

</div>
