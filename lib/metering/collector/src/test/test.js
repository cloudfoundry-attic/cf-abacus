'use strict';

// Usage collector service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const omit = _.omit;
const extend = _.extend;
const clone = _.clone;

// Configure test db URL prefix and splitter and provisioning service URLs
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.METER = 'http://localhost:9081';
process.env.PROVISIONING = 'http://localhost:9380';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend(clone(request), {
  get: spy((uri, req, cb) => cb(undefined, {
      statusCode: 200
    })),
  noWaitPost: spy((uri, req, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

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
        organization_id: 'org_456',
        space_id: 'space_567',
        consumer: {
          type: 'external',
          value: '123'
        },
        resource_id: 'storage',
        plan_id: 'plan_123',
        resource_instance_id: '123',
        metrics: [{
          unit: 'calls',
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
        expect(reqmock.get.args.length).to.equal(1);
        expect(reqmock.get.args[0][0]).to.equal(
          'http://localhost:9380/v1/provisioning/regions/:region/orgs/' +
          ':organization_id/spaces/:space_id/consumers/:consumer_id/' +
          'resources/:resource_id/plans/:plan_id/instances/' +
          ':resource_instance_id');

        // Expect usage to be posted to the splitter service too
        expect(reqmock.noWaitPost.args.length).to.equal(1);
        expect(reqmock.noWaitPost.args[0][0]).to.equal(
          'http://localhost:9081/v1/metering/usage');
        done();
      });
    });
  });
});

