'use strict';

const crypto = require('node:crypto');

const { HttpError } = require('./errors');

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function secretsMatch(providedSecret, configuredSecret) {
  const providedDigest = digest(providedSecret);
  const configuredDigest = digest(configuredSecret);
  return crypto.timingSafeEqual(providedDigest, configuredDigest);
}

function createMachineAuth(configuredSecret) {
  return function machineAuth(req, res, next) {
    const authorization = req.get('authorization');
    const match = typeof authorization === 'string'
      ? authorization.match(/^Bearer ([\x21-\x7e]+)$/u)
      : null;

    if (!match || !secretsMatch(match[1], configuredSecret)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      next(new HttpError(401, 'UNAUTHORIZED', 'Unauthorized'));
      return;
    }

    next();
  };
}

module.exports = { createMachineAuth, secretsMatch };
