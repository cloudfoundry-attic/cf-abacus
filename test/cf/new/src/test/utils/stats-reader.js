'use strict';

const request = require('abacus-request');
const createTokenFactory = require('../utils/token-factory');

const readStats = (config, cb) => {
  const headers = config.token ? {
    authorization: `Bearer ${config.token}`
  } : undefined;

  request.get('http://localhost::port/v1/stats', {
    port: config.port,
    headers
  }, cb);
};

module.exports = (config) => ({
  withValidToken: (cb) => {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create(['abacus.usage.read']);
    readStats({
      port: config.port,
      token: signedToken
    }, cb);
  },
  withMissingScope: (cb) => {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create([]);
    readStats({
      port: config.port,
      token: signedToken
    }, cb);
  },
  withoutToken: (cb) => {
    readStats({
      port: config.port
    }, cb);
  }
});
