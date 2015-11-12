'use strict';

// Sends a request to a list of URLs
const _ = require('underscore');
const extend = _.extend;
const request = require('abacus-request');

const reqmock = extend({}, request, {
  post: (uri, opts, cb) => {
    if(uri.indexOf('failure') > 0)
      cb('error', { statusCode: 400 });
    else
      cb(null, { statusCode: 200 });
  }
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const notify = require('..');

describe('abacus-notify', (done) => {
  it('notify a list of URLs', () => {
    const u = [
      'http://abacus-test.1.success',
      'http://abacus-test.2.success',
      'http://abacus-test.3.success',
      'http://abacus-test.4.success',
      'http://abacus-test.5.success',
      'http://abacus-test.6.success',
      'http://abacus-test.7.success',
      'http://abacus-test.1.failure',
      'http://abacus-test.8.success',
      'http://abacus-test.9.success',
      'http://abacus-test.2.failure'
    ];
    const expected = [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0];
    notify(u, (e, r) => {
      expect(r).to.deep.equal(expected);
    });
  });
});

