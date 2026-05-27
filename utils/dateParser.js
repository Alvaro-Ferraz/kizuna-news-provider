/*
 * ======= • ======= • ======= • ======= • =======• =======
 * AniNewsAPI — dateParser.js
 * Repository: https://github.com/Shineii86/AniNewsAPI
 *
 * @description
 *   Advanced date parser for anime news sources. Handles
 *   ISO 8601, relative time strings ("2 hours ago"),
 *   US/EU date formats, MyAnimeList custom formats, and
 *   time-only strings with AM/PM.
 *
 * @exports parse, parseMALDate, parseRelativeTime, parseDateString
 *
 * @version 4.1.6
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// LOOKUP TABLES
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Month name → index mapping ----
/**
 * Case-insensitive month name to 0-based index map.
 * Supports full names and 3-letter abbreviations.
 * @type {Object.<string, number>}
 */
const MONTHS = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11
};

// ---- FEATURE: Exact relative time strings ----
/**
 * Exact-match relative time strings to minutes offset.
 * NOTE: Checked before regex patterns for O(1) lookup.
 * @type {Object.<string, number>}
 */
const RELATIVE_TIME = {
  'just now': 0,
  'a minute ago': 1,
  'an hour ago': 60,
  'a day ago': 1440,
  'a week ago': 10080,
  'a month ago': 43200,
  'a year ago': 525600
};

// ══════════════════════════════════════════════════════════════
// RELATIVE TIME PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Relative time parsing ----

/**
 * Parse relative time strings like "2 hours ago", "3 days ago".
 *
 * Strategy:
 *   1. Check exact-match table (O(1))
 *   2. Regex scan for "X unit(s) ago" patterns
 *   3. Return null if no match
 *
 * @param {string} text - Raw relative time string
 * @returns {Date|null} Parsed date, or null if unrecognized
 */
function parseRelativeTime(text) {
  const lower = text.toLowerCase().trim();

  // Exact matches first — faster than regex
  if (RELATIVE_TIME[lower] !== undefined) {
    return new Date(Date.now() - RELATIVE_TIME[lower] * 60 * 1000);
  }

  // Regex patterns for "X unit(s) ago" — order matters (most specific first)
  const patterns = [
    { regex: /(\d+)\s*minute?s?\s*ago/i, multiplier: 60 * 1000 },
    { regex: /(\d+)\s*hour?s?\s*ago/i,   multiplier: 60 * 60 * 1000 },
    { regex: /(\d+)\s*day?s?\s*ago/i,    multiplier: 24 * 60 * 60 * 1000 },
    { regex: /(\d+)\s*week?s?\s*ago/i,   multiplier: 7 * 24 * 60 * 60 * 1000 },
    { regex: /(\d+)\s*month?s?\s*ago/i,  multiplier: 30 * 24 * 60 * 60 * 1000 },
    { regex: /(\d+)\s*year?s?\s*ago/i,   multiplier: 365 * 24 * 60 * 60 * 1000 }
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern.regex);
    if (match) {
      const value = parseInt(match[1]);
      return new Date(Date.now() - value * pattern.multiplier);
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// DATE STRING PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Multi-format date string parsing ----

/**
 * Parse various date format strings into Date objects.
 *
 * Supported formats (in priority order):
 *   1. ISO 8601 (native Date constructor)
 *   2. Relative time ("2 hours ago")
 *   3. "Month Day, Year" (e.g. "July 17, 2025")
 *   4. "Day Month Year" (e.g. "17 July 2025")
 *   5. "YYYY-MM-DD" or "YYYY/MM/DD"
 *   6. "DD-MM-YYYY" or "DD/MM/YYYY" (European)
 *   7. Time-only "HH:MM AM/PM" (assumes today)
 *
 * @param {string} dateStr - Raw date string from a news source
 * @returns {Date|null} Parsed date, or null if all formats fail
 */
function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  dateStr = dateStr.trim();

  // Try ISO format first — fastest path
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Parse relative time
  date = parseRelativeTime(dateStr);
  if (date) return date;

  // "July 17, 2025" or "Jul 17, 2025"
  const monthDayYear = dateStr.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(monthDayYear[2]);
      const year = parseInt(monthDayYear[3]);
      return new Date(year, month, day);
    }
  }

  // "17 July 2025" or "17 Jul 2025"
  const dayMonthYear = dateStr.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(dayMonthYear[1]);
      const year = parseInt(dayMonthYear[3]);
      return new Date(year, month, day);
    }
  }

  // "2025-07-17" or "2025/07/17"
  const isoLike = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoLike) {
    return new Date(parseInt(isoLike[1]), parseInt(isoLike[2]) - 1, parseInt(isoLike[3]));
  }

  // "17-07-2025" or "17/07/2025" (European format)
  const euroDate = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (euroDate) {
    return new Date(parseInt(euroDate[3]), parseInt(euroDate[2]) - 1, parseInt(euroDate[1]));
  }

  // Time-only "12:34 AM" — assumes today's date
  const timeOnly = dateStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeOnly) {
    const now = new Date();
    let hours = parseInt(timeOnly[1]);
    const minutes = parseInt(timeOnly[2]);
    const ampm = timeOnly[4]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    now.setHours(hours, minutes, 0, 0);
    return now;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// MYANIMELIST-SPECIFIC PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: MAL date format parser ----

/**
 * Parse MyAnimeList's custom date format from .info text.
 *
 * MAL uses non-standard formats like:
 *   - "12:34 AM, Yesterday"
 *   - "Jul 17, 12:34 AM"
 *   - "3 hours ago"
 *   - "just now"
 *
 * @param {string} infoText - Raw text from MAL's .info element
 * @returns {Date} Parsed date (falls back to current time)
 */
function parseMALDate(infoText) {
  if (!infoText) return new Date();

  const info = infoText.toLowerCase();

  // Instant timestamps
  if (info.includes('just now') || info.includes('seconds ago')) {
    return new Date();
  }

  // "X minutes ago"
  if (info.includes('minutes ago')) {
    const mins = parseInt(info.match(/(\d+)\s*minutes?\s*ago/)?.[1] || 0);
    return new Date(Date.now() - mins * 60 * 1000);
  }

  // "X hours ago"
  if (info.includes('hour') && info.includes('ago')) {
    const hours = parseInt(info.match(/(\d+)\s*hours?\s*ago/)?.[1] || 1);
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  // "Yesterday"
  if (info.includes('yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }

  // "X days ago"
  if (info.includes('days ago')) {
    const days = parseInt(info.match(/(\d+)\s*days?\s*ago/)?.[1] || 1);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  // "Jul 17, 12:34 AM" — MAL's most common format
  const dateMatch = info.match(/([a-z]{3,})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (dateMatch) {
    const month = MONTHS[dateMatch[1].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(dateMatch[2]);
      let hours = parseInt(dateMatch[3]);
      const minutes = parseInt(dateMatch[4]);
      const ampm = dateMatch[5]?.toLowerCase();

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      const year = new Date().getFullYear();
      return new Date(year, month, day, hours, minutes);
    }
  }

  // Ultimate fallback — current time
  return new Date();
}

// ══════════════════════════════════════════════════════════════
// MAIN PARSE FUNCTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Main parse entry point ----

/**
 * Main parse function with fallback.
 *
 * @param {Date|string} dateInput - Date object, date string, or null
 * @param {Date} fallback - Default date if parsing fails (default: now)
 * @returns {Date} Parsed or fallback date
 */
function parse(dateInput, fallback = new Date()) {
  if (!dateInput) return fallback;

  // Already a Date object — just validate
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? fallback : dateInput;
  }

  const parsed = parseDateString(dateInput);
  return parsed || fallback;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = {
  parse,
  parseMALDate,
  parseRelativeTime,
  parseDateString
};

// ══════════════════════════════════════════════════════════════ END: dateParser.js
