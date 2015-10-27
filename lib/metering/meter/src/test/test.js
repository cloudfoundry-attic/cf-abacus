'use strict';

// Usage metering service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const omit = _.omit;

// Configure test db URL prefix and splitter service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.ACCUMULATOR = 'http://localhost::port(9200)';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
let postspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const meterapp = require('..');

describe('abacus-usage-meter', () => {
  it('meters usage docs', (done) => {

    const verify = (secured, done) => {
      // Post usage for a resource, expecting the api to meter the usage,
      // store it in the database and return 201 as response with location
      // URL as a body
      const usage = {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'basic',
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
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

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });


      // Create a test meter app
      const app = meterapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 2) done();
      };

      postspy = (reqs, cb) => {
        // Expect metered usage to be posted to the accumulator service
        expect(reqs[0][0])
          .to.equal('http://localhost:9200/v1/metering/metered/usage');

        expect(omit(
          reqs[0][1].body, 'id', 'processed', 'normalized_usage_id'))
          .to.deep.equal(
            extend(omit(usage, 'id', 'processed'), {
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

        cb(undefined, [[undefined, {
          statusCode: 200
        }]]);

        check();
      };

      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post normalized usage to the meter service
      request.post('http://localhost::p/v1/metering/normalized/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          system: ['abacus.usage.write']
        } : undefined);

        // Get normalized usage back, expecting what we posted
        request.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 2 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            system: ['abacus.usage.read']
          } : undefined);

          expect(omit(val.body, 'id', 'processed')).to.deep.equal(usage);

          check();
        });
      });
    };

    // Verify without and with security
    verify(false, () => verify(true, done));
  });
});

