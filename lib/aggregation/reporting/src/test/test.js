'use strict';

// Aggregated usage reporting service.

const _ = require('underscore');
const request = require('abacus-request');
const db = require('abacus-aggregation-db');
const cluster = require('abacus-cluster');

const clone = _.clone;
const extend = _.extend;

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

const report = require('..');

describe('abacus-usage-report', () => {
  before((done) => {

    // Store test rated usage in our test db
    const rated = {
      id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      usage_id: '222',
      start: 1420502400000,
      end: 1420588799999,
      resources: [
        {
          resource_id: 'object-storage',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: 12
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12,
              cost: 0.36
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'object-storage',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: 12,
                cost: 0.36
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'object-storage',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: 12
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: 12,
                  cost: 0.36
                }]
              }]
            }]
          }]
        }]
    };
    const ratedb = db('test', 'abacus-rated-usage');
    ratedb.put(extend(clone(rated), {
      _id: rated.id
    }), (err, val) => {
      expect(err).to.equal(null);
      done();
    });
  });

  it('retrieves rated usage for an organization', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Define the expected charged usage
    const expected = {
      id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      usage_id: '222',
      start: 1420502400000,
      end: 1420588799999,
      charge: 0.36,
      resources: [
        {
          resource_id: 'object-storage',
          charge: 0.36,
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: 12,
            charge: 0.36
          }],
          plans: [{
            plan_id: 'basic',
            charge: 0.36,
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12,
              cost: 0.36,
              charge: 0.36
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          charge: 0.36,
          resources: [{
            resource_id: 'object-storage',
            charge: 0.36,
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12,
              charge: 0.36
            }],
            plans: [{
              plan_id: 'basic',
              charge: 0.36,
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: 12,
                cost: 0.36,
                charge: 0.36
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            charge: 0.36,
            resources: [{
              resource_id: 'object-storage',
              charge: 0.36,
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: 12,
                charge: 0.36
              }],
              plans: [{
                plan_id: 'basic',
                charge: 0.36,
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: 12,
                  cost: 0.36,
                  charge: 0.36
                }]
              }]
            }]
          }]
        }]
    };
    // Get the rated usage
    request.get(
      'http://localhost::p/v1/organizations/:organization_id/usage/:day', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        day: '2015-01-06'
      }, (err, val) => {
        expect(err).to.equal(undefined);

        // Expect our test rated usage
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(expected);
        done();
      });
  });

  it('queries rated usage for an organization', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Define a GraphQL query and the corresponding expected result
    const query = '{ organization(organization_id: ' +
      '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", date: "2015-01-06") { ' +
      'organization_id, charge, resources { resource_id, aggregated_usage { ' +
      'metric, quantity, charge }}}}';

    const expected = {
      organization: {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        charge: 0.36,
        resources: [
          {
            resource_id: 'object-storage',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12,
              charge: 0.36
            }]
          }]
      }
    };

    // Get the rated usage
    request.get(
      'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
        p: server.address().port,
        query: query
      }, (err, val) => {
        expect(err).to.equal(undefined);

        // Expect our test rated usage
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(expected);
        done();
      });
  });

  it('queries rated usage for a list of organizations', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Define the graphql query and the corresponding expected result
    const query = '{ organizations(organization_ids: ' +
      '["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], date: "2015-01-06") { ' +
      'organization_id, charge, resources { resource_id, aggregated_usage { ' +
      'metric, quantity, charge }}}}';
    const expected = {
      organizations: [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        charge: 0.36,
        resources: [
          {
            resource_id: 'object-storage',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: 12,
              charge: 0.36
            }]
          }]
      }]
    };

    // Get the rated usage
    request.get(
      'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
        p: server.address().port,
        query: query
      }, (err, val) => {
        expect(err).to.equal(undefined);

        // Expect our test rated usage
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(expected);
        done();
      });
  });
});

