'use strict';

const he = require('he');

function decodeEntities(value) {
  let decoded = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = he.decode(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function toPlainText(value) {
  if (typeof value !== 'string') return null;
  let decoded = decodeEntities(value);
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decodeEntities(decoded
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<!--([\s\S]*?)-->/gu, ' ')
      .replace(/<[^>]+>/gu, ' '));
  }
  return decoded
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncateText(value, maximumLength) {
  if (value.length <= maximumLength) return value;
  return value.slice(0, maximumLength).trimEnd();
}

module.exports = { decodeEntities, toPlainText, truncateText };
