'use strict';

const request = require('abacus-request');
const extend = require('underscore').extend;

const mockFuncMap = new Map();
const mockCallsParamsMap = new Map();

const serviceSpy = (reqs, cb) => {
  mockCallsParamsMap.set(reqs[0][0],reqs[0][1]);
  const result = mockFuncMap.get(reqs[0][0]);
  const response = result ? result : { statusCode: 200 };

  cb(undefined, [
    [
      undefined,
      response
    ]
  ]);
};

const reqmock = extend({}, request, {
  get: (reqs, cb) => serviceSpy(reqs, cb),
  batch_get: (reqs, cb) => serviceSpy(reqs, cb),
  batch_post: (reqs, cb) => serviceSpy(reqs, cb)
});

const getSpyCallParams = (url) => mockCallsParamsMap.get(url);

require.cache[require.resolve('abacus-request')].exports = reqmock;

module.exports.reqmock = reqmock;
module.exports.setSpy = (url, result) => mockFuncMap.set(url, result);
module.exports.getSpyCallParams = getSpyCallParams;
