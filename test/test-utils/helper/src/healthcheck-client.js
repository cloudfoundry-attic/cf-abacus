'use strict';

const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const get = yieldable(request.get);

const buildHeaders = (user, password) => {
  if (!user || !password)
    return undefined;

  const credentials = Buffer.from(`${user}:${password}`).toString('base64');
  return {
    authorization: `Basic ${credentials}`
  };
};

module.exports = (port) => {

  const isHealthy = function*({ user, password } = {}) {
    return yield get('http://localhost::port/healthcheck', {
      port,
      headers: buildHeaders(user, password)
    });
  };

  const isEndpointAvailable = function*() {
    const response = yield isHealthy();
    return response.statusCode && response.statusCode == httpStatus.UNAUTHORIZED;
  };

  return {
    isHealthy,
    isEndpointAvailable
  };
};
