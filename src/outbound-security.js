'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const IPV4_BLOCKS = Object.freeze([
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]);

const IPV6_BLOCKS = Object.freeze([
  ['::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]);

function ipv4ToBigInt(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function expandIpv6(address) {
  const withoutZone = address.split('%')[0].toLowerCase();
  const mappedMatch = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u);
  if (mappedMatch) return { mappedIpv4: mappedMatch[1] };

  const halves = withoutZone.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return { groups };
}

function ipv6ToBigInt(address) {
  const expanded = expandIpv6(address);
  if (!expanded || expanded.mappedIpv4) return null;
  return expanded.groups.reduce((value, group) => (
    (value << 16n) | BigInt(Number.parseInt(group, 16))
  ), 0n);
}

function inCidr(value, base, prefix, bits) {
  const shift = BigInt(bits - prefix);
  return (value >> shift) === (base >> shift);
}

function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const value = ipv4ToBigInt(address);
    return value !== null && !IPV4_BLOCKS.some(([base, prefix]) => (
      inCidr(value, ipv4ToBigInt(base), prefix, 32)
    ));
  }

  if (family === 6) {
    const expanded = expandIpv6(address);
    if (!expanded) return false;
    if (expanded.mappedIpv4) return isPublicIp(expanded.mappedIpv4);
    const value = ipv6ToBigInt(address);
    if (value !== null && (value >> 32n) === 0xffffn) {
      const mapped = Number(value & 0xffffffffn);
      const dotted = [24, 16, 8, 0].map((shift) => (mapped >>> shift) & 255).join('.');
      return isPublicIp(dotted);
    }
    return value !== null && !IPV6_BLOCKS.some(([base, prefix]) => (
      inCidr(value, ipv6ToBigInt(base), prefix, 128)
    ));
  }

  return false;
}

function validateOutboundUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PROVIDER_INVALID_URL');
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !hostname || url.username || url.password) {
    throw new Error('PROVIDER_INVALID_URL');
  }
  if (!allowedHosts.includes(hostname)) throw new Error('PROVIDER_HOST_REJECTED');
  return url;
}

async function resolvePublicAddress(hostname, lookup = dns.lookup) {
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('PROVIDER_DNS_REJECTED');
    return { address: hostname, family: net.isIP(hostname) };
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0) throw new Error('PROVIDER_DNS_FAILED');
  if (records.some((record) => !isPublicIp(record.address))) {
    throw new Error('PROVIDER_DNS_REJECTED');
  }
  return { address: records[0].address, family: net.isIP(records[0].address) };
}

module.exports = {
  isPublicIp,
  resolvePublicAddress,
  validateOutboundUrl,
};
