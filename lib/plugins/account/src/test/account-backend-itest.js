'use strict';

// Plugin for an account management service.
const { extend } = require('underscore');
const request = require('abacus-request');
const oauth = require('abacus-oauth');
const cluster = require('abacus-cluster');
const accountPlugin = require('..');

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

describe('abacus-account-plugin', () => {
  let server;

  before(() => {
    process.env.DB = process.env.DB || 'test';
    process.env.SECURED = 'true';
    process.env.ACCOUNT_BACKEND = 'dummy';
    oauthspy.reset();

    // Listen on an ephemeral port
  });

  it('runs a secured account management plugin', (done) => {
    server = accountPlugin(0);
    console.log('>>>>>>>>>>>>>', server);
    request.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
      p: server.address().port,
      org_id: 'abcd-1234',
      time: 1420070400000
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal({
        account_id: 'account-id-78',
        organizations: ['abcd-1234'],
        pricing_country: 'USA',
        license_type: 'TRIAL'
      });
      done();
    });
  });

});
