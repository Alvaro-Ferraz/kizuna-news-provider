/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/openapi.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   OpenAPI 3.0.3 specification endpoint. Returns a
 *   machine-readable API spec for Swagger UI, Postman,
 *   and auto-generated client libraries.
 *
 * @endpoint GET /api/openapi
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/openapi handler ----

/**
 * Main request handler for GET /api/openapi.
 *
 * Returns a complete OpenAPI 3.0.3 specification covering
 * all 12 API endpoints with parameter schemas, response
 * descriptions, and the Article component schema.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');

  // ─── OpenAPI specification ───
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'AniNewsAPI',
      version: '4.1.6',
      description: 'Real-time anime news aggregation API with smart caching, search, RSS feeds, and full-article extraction from 7 sources.',
      contact: { name: 'Shinei Nouzen', url: 'https://github.com/Shineii86', email: 'ikx7a@hotmail.com' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' }
    },
    servers: [
      { url: 'https://aninews.vercel.app', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local Development' }
    ],
    paths: {
      '/api/news': {
        get: {
          summary: 'Get latest anime news',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Max articles to return' },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Pagination offset' },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['latest', 'oldest'], default: 'latest' }, description: 'Sort order' },
            { name: 'source', in: 'query', schema: { type: 'string', enum: ['all', 'ann', 'animecorner', 'myanimelist', 'otakuusa', 'crunchyroll', 'animeherald', 'comicbook'], default: 'all' }, description: 'Filter by source' },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date filter (YYYY-MM-DD)' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date filter (YYYY-MM-DD)' },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Pagination cursor (from meta.nextCursor)' },
            { name: 'refresh', in: 'query', schema: { type: 'boolean', default: false }, description: 'Bypass cache' }
          ],
          responses: {
            '200': { description: 'Successful response with article array and metadata' },
            '500': { description: 'Internal server error' }
          }
        }
      },
      '/api/news/tags': {
        get: {
          summary: 'Filter articles by tags or list available tags',
          parameters: [
            { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Filter by tag name' },
            { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Filter by source' }
          ],
          responses: { '200': { description: 'Tags with counts or filtered articles' } }
        }
      },
      '/api/news/{slug}': {
        get: {
          summary: 'Get full article by slug',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' }, description: 'Article slug identifier' }
          ],
          responses: { '200': { description: 'Full article content' }, '404': { description: 'Article not found' } }
        }
      },
      '/api/search': {
        get: {
          summary: 'Search articles by keyword',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 }, description: 'Search query' },
            { name: 'source', in: 'query', schema: { type: 'string' }, description: 'Filter by source' },
            { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Max results' },
            { name: 'offset', in: 'query', schema: { type: 'integer' }, description: 'Pagination offset' },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date filter (YYYY-MM-DD)' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date filter (YYYY-MM-DD)' }
          ],
          responses: { '200': { description: 'Search results with relevance scoring' }, '400': { description: 'Missing or invalid query' } }
        }
      },
      '/api/rss': {
        get: {
          summary: 'RSS 2.0 feed',
          parameters: [
            { name: 'source', in: 'query', schema: { type: 'string', default: 'all' }, description: 'Filter by source' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Max items' }
          ],
          responses: { '200': { description: 'RSS 2.0 XML feed' } }
        }
      },
      '/api/health': {
        get: { summary: 'Health check', responses: { '200': { description: 'API status, version, uptime' } } }
      },
      '/api/stats': {
        get: { summary: 'Cache statistics', responses: { '200': { description: 'Cache hit/miss metrics' } } }
      },
      '/api/cache/clear': {
        post: { summary: 'Clear cache', responses: { '200': { description: 'Cache cleared' } } }
      },
      '/api/stream': {
        get: {
          summary: 'Server-Sent Events stream for new articles',
          responses: { '200': { description: 'SSE stream — events: new_article, heartbeat' } }
        }
      },
      '/api/sources': {
        get: {
          summary: 'Per-source health and statistics',
          description: 'Returns health status, article counts, and last fetch time for each news source.',
          responses: { '200': { description: 'Source metrics array with health status' } }
        }
      }
    },
    components: {
      schemas: {
        Article: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            slug: { type: 'string' },
            source: { type: 'string' },
            excerpt: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
            image: { type: 'string', format: 'uri' },
            link: { type: 'string', format: 'uri' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  };

  res.status(200).json(spec);
};

// ══════════════════════════════════════════════════════════════ END: api/openapi.js
