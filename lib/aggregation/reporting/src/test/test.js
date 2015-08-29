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
  it('retrieves rated usage for an organization', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Store the rated usage we're expecting in our test db
    const rated = {
      id: 'k-org_123-t-0001420502400000',
      organization_id: 'org_123',
      usage_id: '222',
      start: 1420502400000,
      end: 1420588799999,
      cost: 0.36,
      resources: [
        {
          resource_id: '1234',
          cost: 0.36,
          aggregated_usage: [{
            metric: 'calls',
            quantity: 12,
            cost: 0.36
          }],
          plans: [{
            plan_id: '12345',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'space_567',
          cost: 0.36,
          resources: [{
            resource_id: '1234',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }],
            plans: [{
              plan_id: '12345',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }]
            }]
          }],
          consumers: [{
            consumer_id: '123',
            cost: 0.36,
            resources: [{
              resource_id: '1234',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }],
              plans: [{
                plan_id: '12345',
                cost: 0.36,
                aggregated_usage: [{
                  metric: 'calls',
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

      // Get the rated usage
      request.get(
        'http://localhost::p/v1/organizations/:organization_id/usage/:day', {
          p: server.address().port,
          organization_id: 'org_123',
          day: '2015-01-06'
        }, (err, val) => {
          expect(err).to.equal(undefined);

          // Expect our test rated usage
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(rated);
          done();
        });
    });
  });

  it('queries rated usage for an organization', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Store the test rated usage in our test db
    const rated = {
      id: 'k-org_456-t-0001420502400000',
      organization_id: 'org_456',
      usage_id: '222',
      start: 1420502400000,
      end: 1420588799999,
      cost: 0.36,
      resources: [
        {
          resource_id: '1234',
          cost: 0.36,
          aggregated_usage: [{
            metric: 'calls',
            quantity: 12,
            cost: 0.36
          }],
          plans: [{
            plan_id: '12345',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }]
          }]
        }],
      spaces: [
        {
          id: 'space_567',
          cost: 0.36,
          resources: [{
            resource_id: '1234',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }],
            plans: [{
              plan_id: '12345',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }]
            }]
          }],
          consumers: [{
            consumer_id: '123',
            cost: 0.36,
            resources: [{
              resource_id: '1234',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }],
              plans: [{
                plan_id: '12345',
                cost: 0.36,
                aggregated_usage: [{
                  metric: 'calls',
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

      // Define the graphql query and the corresponding expected result
      const query = '{ organization(organization_id: "org_456", ' +
        'date: "2015-01-06") { organization_id, resources { ' +
        'resource_id, aggregated_usage { metric, quantity}}}}';
      const expected = {
        organization: {
          organization_id: 'org_456',
          resources: [
            {
              resource_id: '1234',
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12
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
  });

  it('queries rated usage for a list of organizations', function(done) {
    this.timeout(60000);

    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Store the test rated usage in our test db
    const rated = {
      id: 'k-org_789-t-0001420502400000',
      organization_id: 'org_789',
      usage_id: '222',
      start: 1420502400000,
      end: 1420588799999,
      cost: 0.36,
      resources: [
        {
          resource_id: '1234',
          cost: 0.36,
          aggregated_usage: [{
            metric: 'calls',
            quantity: 12,
            cost: 0.36
          }],
          plans: [{
            plan_id: '12345',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'space_567',
          cost: 0.36,
          resources: [{
            resource_id: '1234',
            cost: 0.36,
            aggregated_usage: [{
              metric: 'calls',
              quantity: 12,
              cost: 0.36
            }],
            plans: [{
              plan_id: '12345',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }]
            }]
          }],
          consumers: [{
            consumer_id: '123',
            cost: 0.36,
            resources: [{
              resource_id: '1234',
              cost: 0.36,
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12,
                cost: 0.36
              }],
              plans: [{
                plan_id: '12345',
                cost: 0.36,
                aggregated_usage: [{
                  metric: 'calls',
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

      // Define the graphql query and the corresponding expected result
      const query = '{ organizations(organization_ids: ["org_789"], ' +
        'date: "2015-01-06") { organization_id, resources { ' +
        ' resource_id, aggregated_usage { metric, quantity }}}}';
      const expected = {
        organizations: [{
          organization_id: 'org_789',
          resources: [
            {
              resource_id: '1234',
              aggregated_usage: [{
                metric: 'calls',
                quantity: 12
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
});

