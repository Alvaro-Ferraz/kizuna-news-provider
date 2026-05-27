/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — api/stream.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Server-Sent Events endpoint. Sends an initial burst of
 *   status data then closes. Designed for Vercel's 10s
 *   function timeout — long-lived SSE connections are not
 *   possible on serverless. Clients should poll /api/news
 *   with ?refresh=true for fresh data.
 *
 * @endpoint GET /api/stream
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

const { APP_NAME, APP_VERSION } = require('../utils/constants');
const cacheHandler = require('../utils/cacheHandler');

// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: GET /api/stream (SSE) handler ----

/**
 * Main request handler for GET /api/stream.
 *
 * Sends 4 SSE events in sequence, then closes:
 *   1. connected — API name and version
 *   2. status — current article count
 *   3. heartbeat — timestamp for keep-alive detection
 *   4. info — instructions for polling
 *
 * NOTE: Vercel Hobby functions timeout at 10s. This endpoint
 *       sends a single burst and closes immediately. For
 *       real-time updates, clients should poll /api/news.
 */
module.exports = async (req, res) => {
  // ─── SSE headers ───
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // ─── Event 1: Connected ───
  res.write(`data: ${JSON.stringify({ type: 'connected', name: APP_NAME, version: APP_VERSION })}\n\n`);

  // ─── Event 2: Status (article count) ───
  const cached = cacheHandler.get('news_all');
  const count = Array.isArray(cached) ? cached.length : 0;
  res.write(`data: ${JSON.stringify({ type: 'status', articles: count, timestamp: new Date().toISOString() })}\n\n`);

  // ─── Event 3: Heartbeat ───
  res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);

  // ─── Event 4: Info (polling instructions) ───
  res.write(`data: ${JSON.stringify({ type: 'info', message: 'SSE initial burst complete. Poll /api/news for updates.' })}\n\n`);

  // Close connection — serverless can't hold long-lived connections
  res.end();
};

// ══════════════════════════════════════════════════════════════ END: api/stream.js
