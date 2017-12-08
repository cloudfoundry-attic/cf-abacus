'use strict';

const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const createTokenFactory = require('../utils/token-factory');

const get = yieldable(request.get);

const readStats = function*(config) {
  const headers = config.token
    ? {
        authorization: `Bearer ${config.token}`
      }
    : undefined;

  return yield get('http://localhost::port/v1/stats', {
    port: config.port,
    headers
  });
};

module.exports = (config) => {
  const withValidToken = function*() {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create(['abacus.usage.read']);
    return yield readStats({
      port: config.port,
      token: signedToken
    });
  };

  const withMissingScope = function*() {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create([]);
    return yield readStats({
      port: config.port,
      token: signedToken
    });
  };

  const withoutToken = function*() {
    return yield readStats({
      port: config.port
    });
  };

  const isEndpointAvailable = function*() {
    const response = yield withValidToken(config);
    return response.statusCode && response.statusCode !== httpStatus.NOT_FOUND;
  };

  return {
    withValidToken,
    withMissingScope,
    withoutToken,
    isEndpointAvailable
  };
};
