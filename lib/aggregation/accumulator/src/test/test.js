'use strict';

// Usage accumulator service.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const map = _.map;
const clone = _.clone;
const extend = _.extend;

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and aggregator service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.AGGREGATOR = 'http://localhost::port';

const db = require('abacus-aggregation-db');
const dbclient = require('abacus-dbclient');

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, { single: spy() });

// Mock the request module
const reqmock = extend(clone(request),
  { batch_noWaitPost: spy((reqs, cb) => cb()) });
require.cache[require.resolve('abacus-request')].exports = reqmock;

const accumulator = require('..');

// Configure accumulated usage dbs
const accumdb = db(process.env.COUCHDB, 'abacus-accumulated-usage');
const logdb = db(process.env.COUCHDB, 'abacus-accumulated-usage-log');

// Return the accumulation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

describe('abacus-usage-accumulator', () => {
  it('accumulates usage over time', function(done) {
    this.timeout(60000);

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Define a sequence of usage for a resource instance, usage 222 and
    // 223 represent usage for two consecutive time periods, then usage
    // 224 comes as a duplicate of usage 222 and should be skipped
    const usage = [
      {
        id: '222',
        usage_id: '332',
        usage_batch_id: '555',
        metered_usage_id: '422',
        resource_id: 'storage',
        resource_instance_id: '123',
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'plan_123',
        region: 'us',
        organization_id: 'org_456',
        space_id: 'space_567',
        consumer: {
          type: 'external',
          value: '123'
        },
        metrics: [{
          unit: 'BYTE',
          quantity: 1073741824
        }, {
          unit: 'LIGHT_API_CALL',
          quantity: 10
        }, {
          unit: 'HEAVY_API_CALL',
          quantity: 20
        }],
        metered_usage: [{
          unit: 'STORAGE_PER_MONTH',
          quantity: 1
        }, {
          unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
          quantity: 0.01
        }, {
          unit: 'HEAVY_API_CALLS_PER_MONTH',
          quantity: 20
        }]
      },
      {
        id: '223',
        usage_id: '333',
        usage_batch_id: '555',
        metered_usage_id: '423',
        resource_id: 'storage',
        resource_instance_id: '123',
        start: 1420245000000,
        end: 1420247000000,
        plan_id: 'plan_123',
        region: 'us',
        organization_id: 'org_456',
        space_id: 'space_567',
        consumer: {
          type: 'external',
          value: '123'
        },
        metrics: [{
          unit: 'BYTE',
          quantity: 1073741824
        }, {
          unit: 'LIGHT_API_CALL',
          quantity: 10
        }, {
          unit: 'HEAVY_API_CALL',
          quantity: 20
        }],
        metered_usage: [{
          unit: 'STORAGE_PER_MONTH',
          quantity: 1
        }, {
          unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
          quantity: 0.01
        }, {
          unit: 'HEAVY_API_CALLS_PER_MONTH',
          quantity: 20
        }]
      },
      {
        id: '224',
        usage_id: '334',
        usage_batch_id: '555',
        metered_usage_id: '424',
        resource_id: 'storage',
        resource_instance_id: '123',
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'plan_123',
        region: 'us',
        organization_id: 'org_456',
        space_id: 'space_567',
        consumer: {
          type: 'external',
          value: '123'
        },
        metrics: [{
          unit: 'BYTE',
          quantity: 1073741824
        }, {
          unit: 'LIGHT_API_CALL',
          quantity: 10
        }, {
          unit: 'HEAVY_API_CALL',
          quantity: 20
        }],
        metered_usage: [{
          unit: 'STORAGE_PER_MONTH',
          quantity: 1
        }, {
          unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
          quantity: 0.01
        }, {
          unit: 'HEAVY_API_CALLS_PER_MONTH',
          quantity: 20
        }]
      },
      {
        id: '225',
        usage_id: '335',
        usage_batch_id: '555',
        metered_usage_id: '425',
        resource_id: 'storage',
        resource_instance_id: '123',
        start: 1420246800000,
        end: 1420248600000,
        plan_id: 'plan_456',
        region: 'us',
        organization_id: 'org_456',
        space_id: 'space_567',
        consumer: {
          type: 'external',
          value: '123'
        },
        metrics: [{
          unit: 'BYTE',
          quantity: 1073741824
        }, {
          unit: 'LIGHT_API_CALL',
          quantity: 10
        }, {
          unit: 'HEAVY_API_CALL',
          quantity: 20
        }],
        metered_usage: [{
          unit: 'STORAGE_PER_MONTH',
          quantity: 1
        }, {
          unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
          quantity: 0.01
        }, {
          unit: 'HEAVY_API_CALLS_PER_MONTH',
          quantity: 20
        }]
      }];

    // Make sure we are starting clean
    const clean = (done) => {
      let cbs = 0;
      const cb = (err, result) => {
        if(++cbs === 3 * usage.length) done();
      };

      map(usage, (u) => {
        logdb.get(dbclient.kturi(
          [u.organization_id, u.resource_instance_id, u.plan_id].join('-'),
          [day(u.end), u.start, u.end].join('-')), (err, doc) =>
            doc ? logdb.remove(doc, cb) : cb(err, doc));

        accumdb.get(dbclient.kturi(
          [u.organization_id, u.resource_instance_id, u.plan_id].join('-'),
          day(u.end)), (err, doc) => {
            if(doc)
              accumdb.get(doc.last_accumulated_usage_id, (err, doc) =>
                doc ? accumdb.remove(doc, cb) : cb(err, doc));
            else cb(err, doc);

            if(doc) accumdb.remove(doc, cb);
            else cb(err, doc);
          });
      });
    };

    // Post usage to the accumulator
    let locations = {};
    const post = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === usage.length) done();
      };

      // Post each usage doc
      map(usage, (u) => request.post(
        'http://localhost::p/v1/metering/metered/usage',
        { p: server.address().port, body: u }, (err, val) => {
          expect(err).to.equal(undefined);

          // Expect a 201 with the location of the accumulated usage
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          // Record the location returned for each usage doc
          locations[u.id] = val.headers.location;

          cb();
        }));
    };

    // Check posts to the aggregator service
    const checkaggr = (done) => {
      setTimeout(() => {
        // Expect three usage docs to have been posted to the aggregator
        // service using a single batch
        expect(reqmock.batch_noWaitPost.args.length).to.equal(1);
        expect(reqmock.batch_noWaitPost.args[0][0][0][0])
          .to.equal('http://localhost:9200/v1/metering/accumulated/usage');
        expect(reqmock.batch_noWaitPost.args[0][0][1][0])
          .to.equal('http://localhost:9200/v1/metering/accumulated/usage');
        expect(reqmock.batch_noWaitPost.args[0][0][2][0])
          .to.equal('http://localhost:9200/v1/metering/accumulated/usage');

        done();
      }, 500);
    };

    // Get the accumulated usage history
    const get = (done) => {
      let cbs = 0;
      const cb = () => {
        if(++cbs === usage.length) done();
      };

      // Get each version of the accumulated usage
      map(usage, (u) => request.get(locations[u.id], {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(['332', '333', '334', '335']).to.include(val.body.usage_id);

        // Expect accumulated values
        if(val.body.usage_id === '332') {
          expect(val.body.accumulated_usage[1].quantity).to.equal(0.01);
          expect(val.body.accumulated_usage[1].delta).to.equal(0.01);
        }

        if(val.body.usage_id === '333') {
          expect(val.body.accumulated_usage[1].quantity).to.equal(0.02);
          expect(val.body.accumulated_usage[1].delta).to.equal(0.01);
        }

        // Usage 224 is a duplicate of usage 222 so we're expecting
        // the accumulated usage to stay at 2
        if(val.body.usage_id === '334') {
          expect(val.body.accumulated_usage[1].quantity).to.equal(0.02);
          expect(val.body.accumulated_usage[1].delta).to.equal(0);
        }

        // Usage 225 is a new plan, so the delta should match the quantity
        if(val.body.usage_id === '335') {
          expect(val.body.accumulated_usage[1].quantity).to.equal(0.01);
          expect(val.body.accumulated_usage[1].delta).to.equal(0.01);
        }

        cb();
      }));
    };

    // Run the above steps
    clean(() => post(() => checkaggr(() => get(done))));
  });
});
