'use strict';

// Sends a request to a list of URLs
const _ = require('underscore');
const extend = _.extend;
const request = require('abacus-request');
const dbclient = require('abacus-dbclient');

const reqmock = extend({}, request, {
  post: (uri, opts, cb) => {
    if(uri.indexOf('failure') > -1)
      cb('error');
    else
      cb(undefined, 'success');
  }
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Configure test db URL prefix and sink service URLs
process.env.DB = process.env.DB || 'test';

const notify = require('..');

describe('abacus-notify', (done) => {
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-notify-/, done);
  });

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
    notify.notify(u, (e, r) => {
      expect(r).to.deep.equal(expected);
    });
  });

  it('create a registrar', () => {
    notify.registrar({
      dbname: 'abacus-notify-test',
      post: '/v1/test'
    });
  });
});

