'use strict';

// Usage collector service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const omit = _.omit;
const extend = _.extend;

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
  batch_post: spy((reqs, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const collector = require('..');

describe('abacus-usage-collector', () => {
  it('stores and retrieves resource usage data', function(done) {
    this.timeout(60000);

    // Create a test collector app
    const app = collector();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Post usage for a resource, expecting a 201 response
    const batch = {
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

    request.post('http://localhost::p/v1/metering/resource/usage', {
      p: server.address().port,
      body: batch
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);

      // Get usage, expecting what we posted
      request.get(val.headers.location, {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(omit(val.body, 'id')).to.deep.equal(batch);

        // Expect a call to the provisioning service
        setTimeout(() => {
          expect(reqmock.batch_get.args[0][0][0][0]).to.equal(
            'http://localhost:9380/v1/provisioning/regions/:region/orgs/' +
            ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
            'resources/:resource_id/plans/:plan_id/instances/' +
            ':resource_instance_id');

          // Expect usage to be posted to the meter service too
          expect(reqmock.batch_post.args[0][0][0][0]).to.equal(
            'http://localhost:9081/v1/metering/usage');
          done();
        }, 500);
      });
    });
  });
});

