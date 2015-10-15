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
let getspy, postspy;
const reqmock = extend({}, request, {
  batch_get: (reqs, cb) => getspy(reqs, cb),
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope)
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const collector = require('..');

describe('abacus-usage-collector', () => {
  it('stores and retrieves resource usage data', function(done) {
    this.timeout(60000);

    const verify = (secured, done) => {

      const measured = {
        usage: [{
          start: 1420243200000 + secured ? 1 : 0,
          end: 1420245000000 + secured ? 1 : 0,
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

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';

      // Create a test collector app
      const app = collector();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 3) done();
      };

      getspy = (reqs, cb) => {
        // Expect a call to the provisioning service
        expect(reqs[0][0]).to.equal(
          'http://localhost:9380/v1/provisioning/regions/:region/orgs/' +
          ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
          'resources/:resource_id/plans/:plan_id/instances/' +
          ':resource_instance_id/:time');

        cb(undefined, [[undefined, {
          statusCode: 200
        }]]);

        check();
      };

      postspy = (reqs, cb) => {
        // Expect usage to be posted to the meter service
        expect(reqs[0][0]).to.equal(
          'http://localhost:9081/v1/metering/normalized/usage');
        expect(omit(reqs[0][1].body,
          'id', 'processed', 'collected_usage_id'))
          .to.deep.equal(measured.usage[0]);

        cb(undefined, [[undefined, {
          statusCode: 200
        }]]);

        check();
      };

      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post usage for a resource, expecting a 201 response
      request.post('http://localhost::p/v1/metering/collected/usage', {
        p: server.address().port,
        body: measured
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          resource: ['abacus.usage.test-resource.write'],
          system: ['abacus.usage.write']
        } : undefined);

        // Get usage, expecting what we posted
        brequest.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(omit(val.body, 'id', 'processed')).to.deep.equal(measured);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 3 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            resource: ['abacus.usage.test-resource.read'],
            system: ['abacus.usage.read']
          } : undefined);

          check();
        });
      });
    };

    // Verify without and with security
    verify(false, () => verify(true, done));
  });
});
