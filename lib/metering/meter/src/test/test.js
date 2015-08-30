'use strict';

// Usage metering service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;
const clone = _.clone;
const omit = _.omit;

// Configure test db URL prefix and splitter service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.ACCUMULATOR = 'http://localhost::port';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend(clone(request), {
  noWaitPost: spy((uri, req, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

const meterapp = require('..');

describe('abacus-usage-meter', () => {
  describe('usage metering function', () => {
    it('meters usage', () => {
      expect(meterapp.meter({
        resource_id: 'object-storage',
        measured_usage: [{
          measure: 'storage',
          quantity: 1073741824
        }, {
          measure: 'light_api_calls',
          quantity: 2000
        }, {
          measure: 'heavy_api_calls',
          quantity: 3
        }]
      })).to.deep.equal({
        resource_id: 'object-storage',
        measured_usage: [{
          measure: 'storage',
          quantity: 1073741824
        }, {
          measure: 'light_api_calls',
          quantity: 2000
        }, {
          measure: 'heavy_api_calls',
          quantity: 3
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 2
        }, {
          metric: 'heavy_api_calls',
          quantity: 3
        }]
      });
    });
  });

  describe('meter app', () => {
    it('meters usage docs', function(done) {
      this.timeout(60000);

      // Create a test meter app
      const app = meterapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post usage for a resource, expecting the api to meter the usage, store
      // it in the database and return 201 as response with location URL as a
      // body
      const usage = {
        id: '777',
        usage_batch_id: '555',
        resource_id: 'object-storage',
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
        }]
      };

      request.post('http://localhost::p/v1/metering/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Get metered usage, expecting what we posted
        request.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          expect(omit(val.body, 'id')).to.deep.equal(extend(omit(usage, 'id'), {
            usage_id: '777',
            metered_usage: [{
              metric: 'storage',
              quantity: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 0.010
            }, {
              metric: 'heavy_api_calls',
              quantity: 20
            }]
          }));

          // Expect usage to be posted to the accumulator service too
          expect(reqmock.noWaitPost.args.length).to.equal(1);
          expect(reqmock.noWaitPost.args[0][0])
            .to.equal('http://localhost:9100/v1/metering/metered/usage');
          done();
        });
      });
    });
  });
});

