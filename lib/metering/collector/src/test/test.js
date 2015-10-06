'use strict';

// Usage collector service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');

const omit = _.omit;
const extend = _.extend;

const brequest = batch(request);

// Configure test db URL prefix and splitter and provisioning service URLs
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.METER = 'http://localhost:9081';
process.env.PROVISIONING = 'http://localhost:9380';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend({}, request, {
  batch_get: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200
  }]])),
  batch_post: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200
  }]]))
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const collector = require('..');

describe('abacus-usage-collector', () => {
  it('stores and retrieves resource usage data', function(done) {
    this.timeout(60000);

    const measured = {
      usage: [{
        start: 1420243200000,
        end: 1420245000000,
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer: {
          type: 'EXTERNAL',
          consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
        },
        resource_id: 'test-resource',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        measured_usage: [{
          measure: 'light_api_calls',
          quantity: 12
        }]
      }]
    };

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

      // Create a test collector app
      const app = collector();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post usage for a resource, expecting a 201 response
      request.post('http://localhost::p/v1/metering/collected/usage', {
        p: server.address().port,
        body: measured
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(secured ? 1 : 0);

        // Get usage, expecting what we posted
        brequest.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id')).to.deep.equal(measured);

          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(secured ? 3 : 0);

          // Expect a call to the provisioning service
          expect(reqmock.batch_get.args[0][0][0][0]).to.equal(
            'http://localhost:9380/v1/provisioning/regions/:region/orgs/' +
            ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
            'resources/:resource_id/plans/:plan_id/instances/' +
            ':resource_instance_id/:time');

          // Expect usage to be posted to the meter service too
          expect(reqmock.batch_post.args[0][0][0][0]).to.equal(
            'http://localhost:9081/v1/metering/normalized/usage');

          done();
        });
      });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
});
