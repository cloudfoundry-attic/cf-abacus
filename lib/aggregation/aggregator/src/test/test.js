'use strict';

// Usage aggregator service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-oauth');
const seqid = require('abacus-seqid');
const dbclient = require('abacus-dbclient');

const extend = _.extend;
const omit = _.omit;
const map = _.map;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-aggregator-test');

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and a sink service URL
process.env.DB = process.env.DB || 'test';
process.env.SINK = 'http://localhost:9400';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, {
    single: spy()
  });

// Mock the request module
let postspy, getspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb),
  batch_get: (reqs, cb) => getspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;
getspy = brequest;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const aggregator = require('..');

// Template for creating accumulated usage
const accumulatedUsage = (rid, s, e, p, api, dmem, mmem) => ({
  id: dbclient.kturi(rid, p),
  collected_usage_id: '555',
  start: s,
  end: e,
  processed: p,
  resource_id: 'test-resource',
  resource_instance_id: rid,
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  plan_id: 'basic',
  resource_type: 'test-resource',
  account_id: '1234',
  pricing_country: 'USA',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  prices: {
    metrics: [
      { name: 'heavy_api_calls', price: 0.15 },
      { name: 'memory', price: 0.00014 }
    ]
  },
  accumulated_usage: [{
    metric: 'heavy_api_calls',
    windows: [
      [null],
      [null],
      [null],
      [api, null, null],
      [api, null]]
  }, {
    metric: 'memory',
    windows: [
      [null],
      [null],
      [null],
      [dmem, null, null],
      [mmem, null]]
  }]
});

// Expected output plan id
const pid = 'basic/test-metering-plan/' +
  'test-rating-plan/test-pricing-basic';

describe('abacus-usage-aggregator', () => {
  let clock;

  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-aggregator-/, done);
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 12), 'Date');
    authorizespy = spy(function() {});
  });

  afterEach(() => {
    clock.restore();
  });

  it('constructs aggregated usage for an organization', () => {
    // Helper function for creating windows
    const twindows = (quantities, costs) => {
      return map(quantities, (q, i) => {
        return costs ? [{ quantity: q, cost: costs[i] }] : [{ quantity: q }];
      });
    };

    const resource = (quantities, costs, instances) => {
      return [{
        resource_id: 'test-resource',
        aggregated_usage: [{
          metric: 'heavy_api_calls',
          windows: twindows(quantities)
        }],
        plans: [{
          plan_id: pid,
          rating_plan_id: 'test-rating-plan',
          pricing_plan_id: 'test-pricing-basic',
          metering_plan_id: 'test-metering-plan',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            windows: twindows(quantities, costs)
          }]
        }]
      }];
    };

    // Define the aggregated usage we're expecting
    const aggregated = [{
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      resources: resource([12, 22, 32, 42, 52], [1, 2, 3, 4, 5]),
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: resource([12, 22, 32, 42, 52], [1, 2, 3, 4, 5]),
          consumers: [{
            id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
            t: '0001420286400000/0001420286400000'
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      resources: resource([112, 122, 132, 142, 152], [11, 12, 13, 14, 15]),
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: resource([112, 122, 132, 142, 152], [11, 12, 13, 14, 15]),
          consumers: [{
            id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
            t: '0001420286400000/0001420286400000'
          }]
        }]
    }];

    // Construct aggregated usage using an org aggregated usage object
    const agg = [];
    agg[0] = aggregator.newOrg('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28');
    agg[0].resource('test-resource').metric('heavy_api_calls').windows =
      twindows([12, 22, 32, 42, 52]);
    agg[0].resource(
      'test-resource').plan(pid).metric('heavy_api_calls').windows =
        twindows([12, 22, 32, 42, 52], [1, 2, 3, 4, 5]);
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').windows =
          twindows([12, 22, 32, 42, 52]);
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan(pid).metric('heavy_api_calls').windows =
          twindows([12, 22, 32, 42, 52], [1, 2, 3, 4, 5]);
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        '0001420286400000/0001420286400000');
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        '0001420286400000/0001420286400000');

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[0]))).to.deep.equal(aggregated[0]);

    // Serialize to JSON to simulate db storage and retrieval, then revive
    // the org object behavior
    agg[1] = aggregator.reviveOrg(JSON.parse(JSON.stringify(agg[0])));
    agg[1].resource('test-resource').metric('heavy_api_calls').windows =
      twindows([112, 122, 132, 142, 152]);
    agg[1].resource(
        'test-resource').plan(pid).metric('heavy_api_calls').windows =
          twindows([112, 122, 132, 142, 152], [11, 12, 13, 14, 15]);
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').windows =
          twindows([112, 122, 132, 142, 152]);
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan(pid).metric('heavy_api_calls').windows =
          twindows([112, 122, 132, 142, 152], [11, 12, 13, 14, 15]);;
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        '0001420286400000/0001420286400000');
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        '0001420286400000/0001420286400000');

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[1]))).to.deep.equal(aggregated[1]);
  });

  it('aggregates usage for an organization', (done) => {
    const now = new Date();
    const processed = [
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0),
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1),
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2),
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3)
    ];

    // Define a sequence of accumulated usage for several resource instances
    // 0b39fa70-a65f-4183-bae8-385633ca5c87: consuming 6 for 30 mins.
    // 0b39fa70-a65f-4183-bae8-385633ca5c87: Updated to consume 8 till eternity
    // 1b39fa70-a65f-4183-bae8-385633ca5c88: consuming 3 for 33.33 mins.
    // 1b39fa70-a65f-4183-bae8-385633ca5c88: Updated to consume 2 till eternity
    // Daily Usage for both: 6 * 1/2 + 8 * 23.5 + 3 * 0.55 + 2 * 22.39 = ~237.44
    // Monthly Usage for both: 6 * 1/2 + 8 * 695.5 + 3 * 0.55 + 2 * 694.39 =
    //   ~6957.43
    const usage = [
      accumulatedUsage('0b39fa70-a65f-4183-bae8-385633ca5c87', 1420243200000,
        1420245000000, processed[0], { quantity: { current: 12 }, cost: 24 }, {
          quantity: { current: { consumed: 518400000, consuming: 6,
            since: 1420243200000 } },
          cost: { consumed: 518400000, consuming: 6, price: 0.00014 } }, {
            quantity: { current: { consumed: 13996800000, consuming: 6,
              since: 1420243200000 } },
            cost: { consumed: 13996800000, consuming: 6, price: 0.00014 } }),
      accumulatedUsage('0b39fa70-a65f-4183-bae8-385633ca5c87', 1420245000000,
        1420247000000,
        processed[1], { quantity: { previous: 12, current: 22 }, cost: 44 }, {
          quantity: {
            previous: { consumed: 518400000, consuming: 6,
              since: 1420243200000 },
            current: { consumed: 684000000, consuming: 8, since: 1420245000000 }
          },
          cost: { consumed: 684000000, consuming: 8, price: 0.00014 } }, {
            quantity: {
              previous: { consumed: 13996800000, consuming: 6,
                since: 1420243200000 },
              current: { consumed: 18655200000, consuming: 8,
                since: 1420245000000 }
            },
            cost: { consumed: 18655200000, consuming: 8, price: 0.00014 } }),
      accumulatedUsage('1b39fa70-a65f-4183-bae8-385633ca5c88', 1420247000000,
        1420249000000, processed[2], { quantity: { current: 8 }, cost: 16 }, {
          quantity: { current: { consumed: 236400000, consuming: 3,
            since: 1420247000000 } },
          cost: { consumed: 236400000, consuming: 3, price: 0.00014 } }, {
            quantity: { current: { consumed: 6975600000, consuming: 3,
              since: 1420247000000 } },
            cost: { consumed: 6975600000, consuming: 3, price: 0.00014 } }),
      accumulatedUsage('1b39fa70-a65f-4183-bae8-385633ca5c88', 1420249000000,
        1420251000000,
        processed[3], { quantity: { previous: 8, current: 10 }, cost: 20 }, {
          quantity: {
            previous: { consumed: 236400000, consuming: 3,
              since: 1420247000000 },
            current: { consumed: 161600000, consuming: 2,
              since: 1420249000000 }
          },
          cost: { consumed: 161600000, consuming: 2, price: 0.00014 } }, {
            quantity: {
              previous: { consumed: 6975600000, consuming: 3,
                since: 1420247000000 },
              current: { consumed: 4654400000, consuming: 2,
                since: 1420249000000 }
            },
            cost: { consumed: 4654400000, consuming: 2, price: 0.00014 } })
    ];

    const verify = (secured, done) => {
      // Helper function for creating windows
      const twindows = (dq, mq, dc, mc) => {
        const win = [[null], [null], [null], [null, null, null], [null, null]];
        win[3][0] = dc ? { quantity: dq, cost: dc } : { quantity: dq };
        win[4][0] = mc ? { quantity: mq, cost: mc } : { quantity: mq };
        return win;
      };

      // Helper function for creating org resources
      const resource = (apiDQ, apiMQ, memDQ, memMQ, apiDC, apiMC,
        memDC, memMC) => {
        return [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            windows: twindows(apiDQ, apiMQ)
          }, {
            metric: 'memory',
            windows: twindows(memDQ, memMQ)
          }],
          plans: [{
            plan_id: pid,
            rating_plan_id: 'test-rating-plan',
            pricing_plan_id: 'test-pricing-basic',
            metering_plan_id: 'test-metering-plan',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              windows: twindows(apiDQ, apiMQ, apiDC, apiMC)
            }, {
              metric: 'memory',
              windows: twindows(memDQ, memMQ, memDC, memMC)
            }]
          }]
        }];
      };

      // Helper function for creating consumer references
      const consumer = (u, seq) => ({
        id: u.consumer_id,
        t: seqid.pad16(now.getTime()) + seq
      });

      // Define the sequence of aggregated usage we're expecting for an org
      const aggregated = [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        account_id: '1234',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        accumulated_usage_id: '222',
        start: 1420243200000,
        end: 1420245000000,
        resources: resource(12, 12, { consumed: 518400000, consuming: 6 },
          { consumed: 13996800000, consuming: 6 }, 1.8, 1.8,
          { consumed: 518400000, consuming: 6, price: 0.00014 },
          { consumed: 13996800000, consuming: 6, price: 0.00014 }),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            resources: resource(12, 12, { consumed: 518400000, consuming: 6 },
              { consumed: 13996800000, consuming: 6 }, 1.8, 1.8,
              { consumed: 518400000, consuming: 6, price: 0.00014 },
              { consumed: 13996800000, consuming: 6, price: 0.00014 }),
            consumers: [consumer(usage[0], '-0-0-0-' +
              (0 + (secured ? 4 : 0)))]
          }]
      }, {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        account_id: '1234',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        accumulated_usage_id: '223',
        start: 1420245000000,
        end: 1420247000000,
        resources: resource(22, 22, { consumed: 684000000, consuming: 8 },
          { consumed: 18655200000, consuming: 8 }, 3.3, 3.3,
          { consumed: 684000000, consuming: 8, price: 0.00014 },
          { consumed: 18655200000, consuming: 8, price: 0.00014 }),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            resources: resource(22, 22, { consumed: 684000000, consuming: 8 },
              { consumed: 18655200000, consuming: 8 }, 3.3, 3.3,
              { consumed: 684000000, consuming: 8, price: 0.00014 },
              { consumed: 18655200000, consuming: 8, price: 0.00014 }),
            consumers: [consumer(usage[1], '-0-0-0-' +
              (1 + (secured ? 4 : 0)))]
          }]
      }, {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        account_id: '1234',
        accumulated_usage_id: '224',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420247000000,
        end: 1420249000000,
        resources: resource(30, 30, { consumed: 920400000, consuming: 11 },
          { consumed: 25630800000, consuming: 11 }, 4.5, 4.5,
          { consumed: 920400000, consuming: 11, price: 0.00014 },
          { consumed: 25630800000, consuming: 11, price: 0.00014 }),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            resources: resource(30, 30, { consumed: 920400000, consuming: 11 },
              { consumed: 25630800000, consuming: 11 }, 4.5, 4.5,
              { consumed: 920400000, consuming: 11, price: 0.00014 },
              { consumed: 25630800000, consuming: 11, price: 0.00014 }),
            consumers: [consumer(usage[2], '-0-0-0-' +
              (2 + (secured ? 4 : 0)))]
          }]
      }, {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        account_id: '1234',
        accumulated_usage_id: '225',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420249000000,
        end: 1420251000000,
        resources: resource(32, 32, { consumed: 845600000, consuming: 10 },
          { consumed: 23309600000, consuming: 10 }, 4.8, 4.8,
          { consumed: 845600000, consuming: 10, price: 0.00014 },
          { consumed: 23309600000, consuming: 10, price: 0.00014 }),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            resources: resource(32, 32, { consumed: 845600000, consuming: 10 },
              { consumed: 23309600000, consuming: 10 }, 4.8, 4.8,
              { consumed: 845600000, consuming: 10, price: 0.00014 },
              { consumed: 23309600000, consuming: 10, price: 0.00014 }),
            consumers: [consumer(usage[3], '-0-0-0-' +
              (3 + (secured ? 4 : 0)))]
          }]
      }];

      // Helper function to create resource instance reference
      const rireference = (usage) => {
        return {
          id: usage.resource_instance_id,
          t: dbclient.t(usage.id),
          p: usage.processed
        };
      };

      // Helper function for creating consumer resources
      const cresource = (apiDQ, apiMQ, memDQ, memMQ, apiDC, apiMC,
        memDC, memMC, usages) => {
        return [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            windows: twindows(apiDQ, apiMQ)
          }, {
            metric: 'memory',
            windows: twindows(memDQ, memMQ)
          }],
          plans: [{
            plan_id: pid,
            rating_plan_id: 'test-rating-plan',
            pricing_plan_id: 'test-pricing-basic',
            metering_plan_id: 'test-metering-plan',
            resource_instances: map(usages, rireference),
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              windows: twindows(apiDQ, apiMQ, apiDC, apiMC)
            }, {
              metric: 'memory',
              windows: twindows(memDQ, memMQ, memDC, memMC)
            }]
          }]
        }];
      };

      const consumers = [{
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        start: 1420243200000,
        end: 1420245000000,
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        resources: cresource(12, 12, { consumed: 518400000, consuming: 6 },
          { consumed: 13996800000, consuming: 6 }, 1.8, 1.8,
          { consumed: 518400000, consuming: 6, price: 0.00014 },
          { consumed: 13996800000, consuming: 6, price: 0.00014 }, [usage[0]])
      },{
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        start: 1420245000000,
        end: 1420247000000,
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        resources: cresource(22, 22, { consumed: 684000000, consuming: 8 },
          { consumed: 18655200000, consuming: 8 }, 3.3, 3.3,
          { consumed: 684000000, consuming: 8, price: 0.00014 },
          { consumed: 18655200000, consuming: 8, price: 0.00014 }, [usage[1]])
      },{
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420247000000,
        end: 1420249000000,
        resources: cresource(30, 30, { consumed: 920400000, consuming: 11 },
          { consumed: 25630800000, consuming: 11 }, 4.5, 4.5,
          { consumed: 920400000, consuming: 11, price: 0.00014 },
          { consumed: 25630800000, consuming: 11, price: 0.00014 }, [usage[1],
          usage[2]])
      },{
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420249000000,
        end: 1420251000000,
        resources: cresource(32, 32, { consumed: 845600000, consuming: 10 },
          { consumed: 23309600000, consuming: 10 }, 4.8, 4.8,
          { consumed: 845600000, consuming: 10, price: 0.00014 },
          { consumed: 23309600000, consuming: 10, price: 0.00014 }, [usage[1],
          usage[3]])
      }];

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });

      // Create a test aggregator app
      const app = aggregator();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 2) done();
      };

      let posts = 0;
      postspy = (reqs, cb) => {
        debug('Posted new aggregated usage %o', reqs);

        // Expect aggregated usage to be posted to a sink service
        expect(reqs[0][0])
          .to.equal('http://localhost:9400/v1/metering/aggregated/usage');

        // Expect the test organization aggregated values
        const org = reqs[0][1].body;
        expect(omit(org,
          'id', 'processed', 'processed_id', 'accumulated_usage_id'))
          .to.deep.equal(
          extend({},
            omit(aggregated[posts], 'accumulated_usage_id'), {
              organization_id: [
                'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
                secured ? 1 : 0].join('-')
            }));
        // Expect the test consumer aggregated values
        const con = reqs[1][1].body;
        expect(omit(con,
          'id', 'processed', 'processed_id', 'accumulated_usage_id'))
          .to.deep.equal(
          extend({},
            omit(consumers[posts], 'accumulated_usage_id'), {
              organization_id: [
                'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
                secured ? 1 : 0].join('-')
            }));
        posts = posts + 1;

        cb(undefined, [[undefined, {
          statusCode: 201
        }], [undefined, {
          statusCode: 201
        }]]);

        if(posts === 4)
          check();
      };

      // Initialize oauth validator spy
      validatorspy = spy((req, res, next) => next());

      // Post accumulated usage to the aggregator
      const post = () => {

        // Post each usage doc
        transform.reduce(usage, (a, u, i, l, cb) => {
          const uval = extend({}, u, {
            organization_id:
              ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
                secured ? 1 : 0].join('-')
          });

          // Initialize oauth authorize spy
          authorizespy = spy(function() {});

          request.post('http://localhost::p/v1/metering/accumulated/usage', {
            p: server.address().port,
            body: uval
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect a 201 with the location of the accumulated usage
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Check oauth authorize spy
            expect(authorizespy.args[0][0]).to.equal(undefined);
            expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
              system: ['abacus.usage.write']
            } : undefined);

            // Get accumulated usage back, expecting what we posted
            brequest.get(val.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body,
                'id', 'processed', 'processed_id', 'accumulated_usage_id'))
              .to.deep.equal(omit(uval,
                'id', 'processed', 'processed_id', 'accumulated_usage_id'));

              // Check oauth authorize spy
              expect(authorizespy.args[1][0]).to.equal(undefined);
              expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
                system: ['abacus.usage.read']
              } : undefined);

              cb();
            });
          });

        }, undefined, () => {

          // Check oauth validator spy
          expect(validatorspy.callCount).to.equal(secured ? 12 : 0);

          check();
        });
      };

      // Run the above steps
      post();
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('aggregates only to its relevant windows', (done) => {
    let records = 0;
    clock.restore();
    clock = sinon.useFakeTimers(Date.UTC(2015, 9, 31, 2), 'Date');
    const octDay = {
      quantity: {
        current: { consumed: 172800000, consuming: 2, since: 1446249600000 }
      },
      cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
    };
    const octMonth = {
      quantity: {
        current: { consumed: -5011200000, consuming: 2, since: 1446249600000 }
      },
      cost: { consumed: -5011200000, consuming: 2, price: 0.00014 }
    };
    const nov1Day = {
      quantity: {
        current: { consumed: 172800000, consuming: 2, since: 1446336000000 }
      },
      cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
    };
    const nov1Month = {
      quantity: {
        current: { consumed: 5184000000, consuming: 2, since: 1446336000000 }
      },
      cost: { consumed: 5184000000, consuming: 2, price: 0.00014 }
    };
    const nov2Day = {
      quantity: {
        previous: { consumed: 172800000, consuming: 2, since: 1446336000000 },
        current: { consumed: 72000000, consuming: 1, since: 1446422400000 }
      },
      cost: { consumed: 72000000, consuming: 1, price: 0.00014 }
    };
    const nov2Month = {
      quantity: {
        previous: { consumed: 5184000000, consuming: 2, since: 1446336000000 },
        current: { consumed: 2750400000, consuming: 1, since: 1446422400000 }
      },
      cost: { consumed: 2750400000, consuming: 1, price: 0.00014 }
    };
    const usage = [
      accumulatedUsage('bounds', 1446249600000, 1446249600000, 1446256800000),
      accumulatedUsage('bounds', 1446336000000, 1446336000000, 1446418800000),
      accumulatedUsage('bounds', 1446422400000, 1446422400000, 1446418800000)
    ];
    usage[0].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [octDay, null, null], [octMonth, null]]
    }];
    usage[1].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [nov1Day, octDay, null],
        [nov1Month, octMonth]]
    }];
    usage[2].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [nov2Day, octDay, null],
        [nov2Month, octMonth]]
    }];

    // Expect the October usage to be untouched by the November submissions
    const expectedDay = {
      consuming: 2,
      consumed: 172800000
    };
    const expectedMonth = {
      consuming: 2,
      consumed: -5011200000
    };

    // Create a test aggregator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postNov = () => {
      clock.restore();
      clock = sinon.useFakeTimers(Date.UTC(2015, 10, 1, 23), 'Date');
      request.post('http://localhost::p/v1/metering/accumulated/usage', {
        p: server.address().port,
        body: usage[1]
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        request.post('http://localhost::p/v1/metering/accumulated/usage', {
          p: server.address().port,
          body: usage[2]
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
        });
      });
    };

    postspy = (reqs, cb) => {
      records++;
      if(records === 1)
        postNov();
      if(records === 3) {
        expect(reqs[0][1].body.resources[0].aggregated_usage[0]
          .windows[4][1].quantity).to.deep.equal(expectedMonth);
        expect(reqs[0][1].body.resources[0].aggregated_usage[0]
          .windows[3][1].quantity).to.deep.equal(expectedDay);
        done();
      }

      cb(undefined, [[undefined, {
        statusCode: 201
      }], [undefined, {
        statusCode: 201
      }]]);
    };

    request.post('http://localhost::p/v1/metering/accumulated/usage', {
      p: server.address().port,
      body: usage[0]
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
    });
  });

  it('selects the correct time window to aggregate to', (done) => {
    let records = 0;
    clock.restore();
    clock = sinon.useFakeTimers(Date.UTC(2016, 0, 31, 12), 'Date');
    const jan1Day = {
      quantity: {
        current: { consumed: 172800000, consuming: 2, since: 1454198400000 }
      },
      cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
    };
    const jan1Month = {
      quantity: {
        current: { consumed: -5011200000, consuming: 2, since: 1454198400000 }
      },
      cost: { consumed: -5011200000, consuming: 2, price: 0.00014 }
    };
    const jan2Day = {
      quantity: {
        previous: { consumed: 172800000, consuming: 2, since: 1454198400000 },
        current: { consumed: 144000000, consuming: 1, since: 1454227200000 }
      },
      cost: { consumed: 144000000, consuming: 1, price: 0.00014 }
    };
    const jan2Month = {
      quantity: {
        previous: { consumed: -5011200000, consuming: 2, since: 1454198400000 },
        current: { consumed: -2448000000, consuming: 1, since: 1454227200000 }
      },
      cost: { consumed: -2448000000, consuming: 1, price: 0.00014 }
    };
    const febDay = {
      quantity: {
        current: { consumed: 115200000, consuming: 2, since: 1454299200000 }
      },
      cost: { consumed: 115200000, consuming: 2, price: 0.00014 }
    };
    const febMonth = {
      quantity: {
        current: { consumed: 4953600000, consuming: 2, since: 1454299200000 }
      },
      cost: { consumed: 4953600000, consuming: 2, price: 0.00014 }
    };
    const usage = [
      accumulatedUsage('bounds', 1454198400000, 1454198400000, 1454198400000),
      accumulatedUsage('bounds', 1454227200000, 1454227200000, 1454313600000),
      accumulatedUsage('bounds', 1454299200000, 1454299200000, 1454313600000)
    ];
    usage[0].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [jan1Day, null, null],
        [jan1Month, null]]
    }];
    usage[1].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [null, jan2Day, null],
        [null, jan2Month]]
    }];
    usage[2].accumulated_usage = [{
      metric: 'memory',
      windows: [[null], [null], [null], [febDay, jan2Day, null],
        [febMonth, jan2Month]]
    }];

    // Create a test aggregator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postFeb = () => {
      clock.restore();
      clock = sinon.useFakeTimers(Date.UTC(2016, 1, 1, 8), 'Date');
      request.post('http://localhost::p/v1/metering/accumulated/usage', {
        p: server.address().port,
        body: usage[1]
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        request.post('http://localhost::p/v1/metering/accumulated/usage', {
          p: server.address().port,
          body: usage[2]
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
        });
      });
    };

    const expected = [[null],[null],[null],
      [
        {
          quantity: { consuming: 2, consumed: 115200000 },
          cost: { consuming: 2, consumed: 115200000, price: 0.00014 }
        },
        {
          quantity: { consuming: 1, consumed: 144000000 },
          cost: { consuming: 1, consumed: 144000000, price: 0.00014 }
        },
        null
      ],
      [
        {
          quantity: { consuming: 2, consumed: 4953600000 },
          cost: { consuming: 2, consumed: 4953600000, price: 0.00014 }
        },
        {
          quantity: { consuming: 1, consumed: -2448000000 },
          cost: { consuming: 1, consumed: -2448000000, price: 0.00014 }
        }
      ]
    ];

    postspy = (reqs, cb) => {
      records++;
      if(records === 1)
        postFeb();
      if(records === 3) {
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0]
          .windows).to.deep.equal(expected);
        done();
      }

      cb(undefined, [[undefined, {
        statusCode: 201
      }], [undefined, {
        statusCode: 201
      }]]);
    };

    request.post('http://localhost::p/v1/metering/accumulated/usage', {
      p: server.address().port,
      body: usage[0]
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
    });
  });

  it('shifts all windows successfully', (done) => {
    clock.restore();
    clock = sinon.useFakeTimers(Date.UTC(2016, 3, 30), 'Date');
    let records = 0;
    const usage = [
      accumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
      accumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
      accumulatedUsage('bounds', 1462060800000, 1462060800000, 1462060800000)
    ];
    const body = () => {
      return extend({}, {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 500 }, cost: 75 }, null, null],
          [{ quantity: { current: 500 }, cost: 75 }, null]]
      });
    };
    usage[0].accumulated_usage = [body()];
    usage[1].accumulated_usage = [body()];
    usage[2].accumulated_usage = [body()];
    usage[1].plan_id = 'standard';

    // Expected values for the different levels of aggregation
    const expected = {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null],
        [{ quantity: 500 }, { quantity: 1000 }, null],
        [{ quantity: 500 }, { quantity: 1000 }]]
    };
    const expectedBasic = {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null],
        [{ quantity: 500, cost: 75 }, { quantity: 500, cost: 75 }, null],
        [{ quantity: 500, cost: 75 }, { quantity: 500, cost: 75 }]]
    };
    const expectedStandard = {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null],
        [null, { quantity: 500 , cost: 75 }, null],
        [null, { quantity: 500 , cost: 75 }]]
    };

    // Create a test aggregator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    postspy = (reqs, cb) => {
      records++;
      if(records === 3) {
        const org = reqs[0][1].body;
        const con = reqs[1][1].body;
        // Check the org aggregated resources
        expect(org.resources[0].aggregated_usage[0]).to.deep.equal(expected);
        expect(org.resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);
        expect(org.resources[0].plans[1].aggregated_usage[0])
          .to.deep.equal(expectedStandard);
        // Check the space aggregated resources
        expect(org.spaces[0].resources[0].aggregated_usage[0])
          .to.deep.equal(expected);
        expect(org.spaces[0].resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);
        expect(org.spaces[0].resources[0].plans[1].aggregated_usage[0])
          .to.deep.equal(expectedStandard);
        // Check the consumer
        expect(con.resources[0].aggregated_usage[0]).to.deep.equal(expected);
        expect(con.resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);
        expect(con.resources[0].plans[1].aggregated_usage[0])
          .to.deep.equal(expectedStandard);
        done();
      }

      cb(undefined, [[undefined, {
        statusCode: 201
      }], [undefined, {
        statusCode: 201
      }]]);
    };

    const post = (u, done) => {
      request.post('http://localhost::p/v1/metering/accumulated/usage', {
        p: server.address().port,
        body: u
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        if(done)
          done();
      });
    };
    post(usage[0], () => post(usage[1], () => {
      clock = sinon.useFakeTimers(Date.UTC(2016, 4, 1), 'Date');
      post(usage[2]);
    }));
  });

  it('attaches error and reasons when there is a business error', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 5), 'Date');

    // Create a test accumulator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 2) done();
    };

    const usage = {
      collected_usage_id: '666',
      resource_id: 'test-error',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: 14202432000034,
      end: 1420243200034,
      plan_id: 'error',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-errorcf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-errorb6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-errorbab',
      resource_type: 'test-error',
      account_id: '12345',
      pricing_country: 'USA',
      metering_plan_id: 'test-metering-plan',
      rating_plan_id: 'invalidRatingPlan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [{
          name: 'heavy_api_calls',
          price: 1
        }]
      },
      accumulated_usage: [{
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [5, null, null],
          [5, null]]
      }]
    };

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal(
        'http://localhost:9880/v1/rating/plans/:rating_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        rating_plan_id: 'invalidRatingPlan'
      });
      cb(undefined, [[undefined, {
        statusCode: 404
      }]]);

      check();
    };

    request.post('http://localhost::p/v1/metering/accumulated/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
      expect(val.body).to.deep.equal({
        error: 'erplannotfound',
        reason: 'Rating plan for the rating plan id invalidRatingPlan ' +
          'is not found'
      });

      // Get normalized usage back, expecting what we posted
      request.get(val.headers.location, {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        expect(omit(val.body,
          'id', 'processed', 'processed_id', 'accumulated_usage_id'))
          .to.deep.equal(omit(usage, 'id'));

        check();
      });
    });
  });

  it('takes error and reason from the sink and returns it', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 5), 'Date');

    // Create a test accumulator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 2) done();
    };

    const usage = {
      collected_usage_id: '666',
      resource_id: 'test-error',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: 14202432000034,
      end: 1420243200034,
      plan_id: 'error',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-errorcf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-errorb6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-errorbab',
      resource_type: 'test-error',
      account_id: '12345',
      pricing_country: 'USA',
      metering_plan_id: 'test-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [{
          name: 'heavy_api_calls',
          price: 1
        }]
      },
      accumulated_usage: [{
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { previous: null, current: 5 } }, null, null],
          [{ quantity: { previous: null, current: 5 } }, null]]
      }]
    };

    postspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal(
        'http://localhost:9400/v1/metering/aggregated/usage');

      // Simulates business error in abacus-aggregator
      cb(undefined, [[undefined, {
        statusCode: 201,
        body: {
          error: 'emplannotfound',
          reason: 'Metering plan for the metering plan id ' +
            'test-metering-plan is not found'
        }
      }], [undefined, {
        statusCode: 201
      }]]);

      check();
    };

    request.post('http://localhost::p/v1/metering/accumulated/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
      expect(val.body).to.deep.equal({
        error: 'esink',
        reason: [{
          error: 'emplannotfound',
          reason: 'Metering plan for the metering plan id ' +
            'test-metering-plan is not found'
        }]
      });

      // Get normalized usage back, expecting what we posted
      request.get(val.headers.location, {}, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        expect(omit(val.body, 'id', 'processed', 'processed_id'))
          .to.deep.equal(usage);

        check();
      });
    });
  });

  it('processed time falls in prev day/month', (done) => {
    process.env.SLACK = '1D';
    clock.restore();
    let records = 0;
    const usage = [
      accumulatedUsage('p', 1467244799999, 1467244799999, 1467244799999),
      accumulatedUsage('p', 1467331199999, 1467331199999, 1467331199999),
      accumulatedUsage('p', 1467417599999, 1467417599999, 1467417599999),
      accumulatedUsage('p', 1467503999999, 1467503999999, 1467503999999)
    ];

    map(usage, (u) => {
      u.organization_id = 'timeorg';
    });

    usage[0].accumulated_usage = [{
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [
          { quantity: { current: 100 }, cost: 15 },
          null
        ],
        [
          { quantity: { current: 100 }, cost: 15 },
          null
        ]
      ]
    }];
    usage[1].accumulated_usage = [{
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [
          { quantity: { current: 200 }, cost: 30 },
          { quantity: { current: 100 }, cost: 15 }
        ],
        [
          { quantity: { previous: 100, current: 300 }, cost: 45 },
          null
        ]
      ]
    }];

    usage[2].accumulated_usage = [{
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [
          { quantity: { current: 300 }, cost: 45 },
          { quantity: { current: 200 }, cost: 30 }
        ],
        [ { quantity: { current: 300 }, cost: 45 },
          { quantity: { previous: 100, current: 300 }, cost: 45 }
        ]
      ]
    }];

    usage[3].accumulated_usage = [{
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [
          { quantity: { current: 400 }, cost: 60 },
          { quantity: { current: 300 }, cost: 45 }
        ],
        [
          { quantity: { previous: 300, current: 700 }, cost: 105 },
          { quantity: { previous: 100, current: 300 }, cost: 45 }
        ]
      ]
    }];

    // Expected values for the different levels of aggregation
    const expected = {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null],
        [null, { quantity: 400 }],
        [{ quantity: 700 }, { quantity: 300 }]]
    };
    const expectedBasic = {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null],
        [null, { quantity: 400, cost: 60 }],
        [{ quantity: 700, cost: 105 }, { quantity: 300, cost: 45 }]]
    };

    // Create a test aggregator app
    const app = aggregator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    postspy = (reqs, cb) => {
      records++;
      cb(undefined, [[undefined, {
        statusCode: 201
      }], [undefined, {
        statusCode: 201
      }]]);
      if(records === 4) {
        const org = reqs[0][1].body;
        const con = reqs[1][1].body;
        // Check the org aggregated resources
        expect(org.resources[0].aggregated_usage[0]).to.deep.equal(expected);
        expect(org.resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);

        // Check the space aggregated resources
        expect(org.spaces[0].resources[0].aggregated_usage[0])
          .to.deep.equal(expected);
        expect(org.spaces[0].resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);
        // Check the consumer
        expect(con.resources[0].aggregated_usage[0]).to.deep.equal(expected);
        expect(con.resources[0].plans[0].aggregated_usage[0])
          .to.deep.equal(expectedBasic);
        done();
      }
    };

    const post = (u, done) => {
      request.post('http://localhost::p/v1/metering/accumulated/usage', {
        p: server.address().port,
        body: u
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        if(done)
          done();
      });
    };
    clock = sinon.useFakeTimers(usage[0].processed + 1, 'Date');
    post(usage[0], () => {
      clock = sinon.useFakeTimers(usage[1].processed + 1, 'Date');
      post(usage[1], () => {
        clock = sinon.useFakeTimers(usage[2].processed + 1, 'Date');
        post(usage[2], () => {
          clock = sinon.useFakeTimers(usage[3].processed + 1, 'Date');
          post(usage[3], () => {});
        });
      });
    });
  });
});
