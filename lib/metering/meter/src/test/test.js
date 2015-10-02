'use strict';

// Usage metering service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const omit = _.omit;

const brequest = batch(request);

// Configure test db URL prefix and splitter service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.ACCUMULATOR = 'http://localhost::port';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend({}, request, {
  batch_post: spy((reqs, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const meterapp = require('..');

describe('abacus-usage-meter', () => {
  it('meters usage docs', function(done) {
    this.timeout(60000);

    // Post usage for a resource, expecting the api to meter the usage, store
    // it in the database and return 201 as response with location URL as a
    // body
    const usage = {
      id: '777',
      collected_usage_id: '555',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
      start: 1420243200000,
      end: 1420245000000,
      plan_id: 'basic',
      region: 'us',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      consumer: {
        type: 'EXTERNAL',
        consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
      },
      measured_usage: [{
        measure: 'storage',
        quantity: 1073741824
      }, {
        measure: 'light_api_calls',
        quantity: 10
      }, {
        measure: 'heavy_api_calls',
        quantity: 20
      }, {
        measure: 'instance_memory',
        quantity: 3
      }, {
        measure: 'running_instances',
        quantity: 2
      }]
    };

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

      // Create a test meter app
      const app = meterapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      request.post('http://localhost::p/v1/metering/normalized/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator spy
        expect(oauthspy.callCount).to.equal(secured ? 1 : 0);

        // Get metered usage, expecting what we posted
        brequest.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(secured ? 3 : 0);

          expect(omit(val.body, 'id')).to.deep.equal(extend(omit(usage, 'id'), {
            normalized_usage_id: '777',
            metered_usage: [{
              metric: 'storage',
              quantity: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 0.010
            }, {
              metric: 'heavy_api_calls',
              quantity: 20
            }, {
              metric: 'memory',
              quantity: {
                consuming: 6,
                since: 1420243200000
              }
            }]
          }));

          // Expect usage to be posted to the accumulator service too
          expect(reqmock.batch_post.args[0][0][0][0])
            .to.equal('http://localhost:9100/v1/metering/metered/usage');

          done();
        });
      });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
});

