'use strict';

const { promisify } = require('util');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');

const RequestStrategy = {

  direct: () => ({
    get: promisify(request.get),
    put: promisify(request.put),
    post: promisify(request.post)
  }),

  reliable: () => {
    const reliableRequest = retry(breaker(batch(request)));

    return {
      get: promisify(reliableRequest.get),
      put: promisify(reliableRequest.put),
      post: promisify(reliableRequest.post)
    };
  }

};

module.exports = {
  RequestStrategy
};
