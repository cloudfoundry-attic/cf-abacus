'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');

const request = require('abacus-request');

const createTokenFactory = require('./token-factory');

const get = util.promisify(request.get);

const readStats = async (config) => {
  const headers = config.token
    ? {
      authorization: `Bearer ${config.token}`
    }
    : undefined;

  return await get('http://localhost::port/v1/stats', {
    port: config.port,
    headers
  });
};

module.exports = (config) => {
  const withValidToken = async () => {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create(['abacus.usage.read']);
    return await readStats({
      port: config.port,
      token: signedToken
    });
  };

  const withMissingScope = async () => {
    const tokenFactory = createTokenFactory(config.tokenSecret);
    const signedToken = tokenFactory.create([]);
    return await readStats({
      port: config.port,
      token: signedToken
    });
  };

  const withoutToken = async () => {
    return await readStats({
      port: config.port
    });
  };

  return {
    withValidToken,
    withMissingScope,
    withoutToken
  };
};
