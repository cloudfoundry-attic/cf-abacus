'use strict';

// Usage aggregator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const transform = require('abacus-transform');
const oauth = require('abacus-oauth');
const seqid = require('abacus-seqid');
const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
const functioncb = require('abacus-yieldable').functioncb;

const extend = _.extend;
const omit = _.omit;
const map = _.map;


const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-aggregator-test');

/* eslint handle-callback-err: 0 */

process.env.SINK = 'http://localhost:9400';
// unset all SAMPLING configurations
delete process.env.SAMPLING;

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
    metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
  },
  accumulated_usage: [
    {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null], [api, null, null], [api, null]]
    },
    {
      metric: 'memory',
      windows: [[null], [null], [null], [dmem, null, null], [mmem, null]]
    }
  ]
});

// Expected output plan id
const pid = 'basic/test-metering-plan/' + 'test-rating-plan/test-pricing-basic';

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-aggregator', () => {
  let clock;
  const systemToken = () => {};

  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(dbEnv, /^abacus-aggregator-/, done);
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 12),
      toFake: ['Date']
    });
    authorizespy = spy(function() {});
  });

  afterEach(() => {
    clock.restore();
  });

  it('constructs aggregated usage for an organization', () => {
    // Helper function for creating windows
    const twindows = (quantities) => map(quantities, (q) => [{ quantity: q }]);

    const resource = (quantities) => {
      return [
        {
          resource_id: 'test-resource',
          plans: [
            {
              plan_id: pid,
              rating_plan_id: 'test-rating-plan',
              pricing_plan_id: 'test-pricing-basic',
              metering_plan_id: 'test-metering-plan',
              aggregated_usage: [
                {
                  metric: 'heavy_api_calls',
                  windows: twindows(quantities)
                }
              ]
            }
          ]
        }
      ];
    };

    // Define the aggregated usage we're expecting
    const aggregated = [
      {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        resources: resource([12, 22, 32, 42, 52]),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            t: seqid.sample('0001525261459051-0-0-1-0', 1)
          }
        ]
      },
      {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
        resources: resource([112, 122, 132, 142, 152]),
        spaces: [
          {
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            t: seqid.sample('0001525261459051-0-0-1-0', 1)
          }
        ]
      }
    ];

    // Construct aggregated usage using an org aggregated usage object
    const agg = [];
    agg[0] = aggregator.newOrg('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28');
    agg[0]
      .resource('test-resource')
      .plan(pid)
      .metric('heavy_api_calls').windows = twindows([12, 22, 32, 42, 52]);
    agg[0]
      .space('aaeae239-f3f8-483c-9dd0-de5d41c38b6a', seqid.sample('0001525261459051-0-0-1-0', 1));

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[0]))).to.deep.equal(aggregated[0]);

    // Serialize to JSON to simulate db storage and retrieval, then revive
    // the org object behavior
    agg[1] = aggregator.reviveOrg(JSON.parse(JSON.stringify(agg[0])));
    agg[1]
      .resource('test-resource')
      .plan(pid)
      .metric('heavy_api_calls').windows = twindows([112, 122, 132, 142, 152]);
    agg[1]
      .space('aaeae239-f3f8-483c-9dd0-de5d41c38b6a', seqid.sample('0001525261459051-0-0-1-0', 1));

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[1]))).to.deep.equal(aggregated[1]);
  });

  it('aggregates usage for an organization', (done) => {

    const now = moment.utc().toDate();
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
      accumulatedUsage(
        '0b39fa70-a65f-4183-bae8-385633ca5c87',
        1420243200000,
        1420245000000,
        processed[0],
        {
          quantity: { current: 12 }
        },
        {
          quantity: {
            current: {
              consumed: 518400000,
              consuming: 6,
              since: 1420243200000
            }
          }
        },
        {
          quantity: {
            current: {
              consumed: 13996800000,
              consuming: 6,
              since: 1420243200000
            }
          }
        }
      ),
      accumulatedUsage(
        '0b39fa70-a65f-4183-bae8-385633ca5c87',
        1420245000000,
        1420247000000,
        processed[1],
        {
          quantity: { previous: 12, current: 22 }
        },
        {
          quantity: {
            previous: {
              consumed: 518400000,
              consuming: 6,
              since: 1420243200000
            },
            current: { consumed: 684000000, consuming: 8, since: 1420245000000 }
          }
        },
        {
          quantity: {
            previous: {
              consumed: 13996800000,
              consuming: 6,
              since: 1420243200000
            },
            current: {
              consumed: 18655200000,
              consuming: 8,
              since: 1420245000000
            }
          }
        }
      ),
      accumulatedUsage(
        '1b39fa70-a65f-4183-bae8-385633ca5c88',
        1420247000000,
        1420249000000,
        processed[2],
        {
          quantity: { current: 8 }
        },
        {
          quantity: {
            current: {
              consumed: 236400000,
              consuming: 3,
              since: 1420247000000
            }
          }
        },
        {
          quantity: {
            current: {
              consumed: 6975600000,
              consuming: 3,
              since: 1420247000000
            }
          }
        }
      ),
      accumulatedUsage(
        '1b39fa70-a65f-4183-bae8-385633ca5c88',
        1420249000000,
        1420251000000,
        processed[3],
        {
          quantity: { previous: 8, current: 10 }
        },
        {
          quantity: {
            previous: {
              consumed: 236400000,
              consuming: 3,
              since: 1420247000000
            },
            current: {
              consumed: 161600000,
              consuming: 2,
              since: 1420249000000
            }
          }
        },
        {
          quantity: {
            previous: {
              consumed: 6975600000,
              consuming: 3,
              since: 1420247000000
            },
            current: {
              consumed: 4654400000,
              consuming: 2,
              since: 1420249000000
            }
          }
        }
      )
    ];
    let allPosts = 0;
    const verify = (secured, done) => {
      // Helper function for creating windows
      const twindows = (dailyQuantity, monthlyQuantity, previousDailyQuantity, previousMonthlyQuantity) => {
        const win = [[null], [null], [null], [null, null, null], [null, null]];
        win[3][0] = { quantity: dailyQuantity, previous_quantity: previousDailyQuantity };
        win[4][0] = { quantity: monthlyQuantity, previous_quantity: previousMonthlyQuantity };
        return win;
      };

      // Helper function for creating org resources
      const resource = (apiDQ, apiMQ, memDQ, memMQ, papiDQ, papiMQ, pmemDQ, pmemMQ) => {
        return [
          {
            resource_id: 'test-resource',
            plans: [
              {
                plan_id: pid,
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                aggregated_usage: [
                  {
                    metric: 'heavy_api_calls',
                    windows: twindows(apiDQ, apiMQ, papiDQ, papiMQ)
                  },
                  {
                    metric: 'memory',
                    windows: twindows(memDQ, memMQ, pmemDQ, pmemMQ)
                  }
                ]
              }
            ]
          }
        ];
      };

      // Define the sequence of aggregated usage we're expecting for an org
      const aggregated = [
        {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          account_id: '1234',
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          accumulated_usage_id: '222',
          start: 1420243200000,
          end: 1420245000000,
          resources: resource(
            12,
            12,
            { consumed: 518400000, consuming: 6 },
            { consumed: 13996800000, consuming: 6 },
            null,
            null,
            null,
            null
          ),
          spaces: [
            {
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          accumulated_usage_id: '223',
          start: 1420245000000,
          end: 1420247000000,
          resources: resource(
            22,
            22,
            { consumed: 684000000, consuming: 8 },
            { consumed: 18655200000, consuming: 8 },
            12,
            12,
            { consumed: 518400000, consuming: 6 },
            { consumed: 13996800000, consuming: 6 }
          ),
          spaces: [
            {
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          accumulated_usage_id: '224',
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
          start: 1420247000000,
          end: 1420249000000,
          resources: resource(
            30,
            30,
            { consumed: 920400000, consuming: 11 },
            { consumed: 25630800000, consuming: 11 },
            22,
            22,
            { consumed: 684000000, consuming: 8 },
            { consumed: 18655200000, consuming: 8 }
          ),
          spaces: [
            {
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          accumulated_usage_id: '225',
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
          start: 1420249000000,
          end: 1420251000000,
          resources: resource(
            32,
            32,
            { consumed: 845600000, consuming: 10 },
            { consumed: 23309600000, consuming: 10 },
            30,
            30,
            { consumed: 920400000, consuming: 11 },
            { consumed: 25630800000, consuming: 11 }
          ),
          spaces: [
            {
              space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
              t: '0001420286400000'
            }
          ]
        }
      ];

      // Helper function to create resource instance reference
      const rireference = (usage) => {
        return {
          id: usage.resource_instance_id,
          t: dbclient.t(usage.id),
          p: usage.processed
        };
      };

      // Helper function for creating consumer resources
      const cresource = (apiDQ, apiMQ, memDQ, memMQ, usages, papiDQ, papiMQ, pmemDQ, pmemMQ) => [
        {
          resource_id: 'test-resource',
          plans: [
            {
              plan_id: pid,
              rating_plan_id: 'test-rating-plan',
              pricing_plan_id: 'test-pricing-basic',
              metering_plan_id: 'test-metering-plan',
              resource_instances: map(usages, rireference),
              aggregated_usage: [
                {
                  metric: 'heavy_api_calls',
                  windows: twindows(apiDQ, apiMQ, papiDQ, papiMQ)
                },
                {
                  metric: 'memory',
                  windows: twindows(memDQ, memMQ, pmemDQ, pmemMQ)
                }
              ]
            }
          ]
        }
      ];

      const consumers = [
        {
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          start: 1420243200000,
          end: 1420245000000,
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          resources: cresource(
            12,
            12,
            { consumed: 518400000, consuming: 6 },
            { consumed: 13996800000, consuming: 6 },
            [usage[0]],
            null,
            null,
            null,
            null
          )
        },
        {
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          start: 1420245000000,
          end: 1420247000000,
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          resources: cresource(
            22,
            22,
            { consumed: 684000000, consuming: 8 },
            { consumed: 18655200000, consuming: 8 },
            [usage[1]],
            12,
            12,
            { consumed: 518400000, consuming: 6 },
            { consumed: 13996800000, consuming: 6 }
          )
        },
        {
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          start: 1420247000000,
          end: 1420249000000,
          resources: cresource(
            30,
            30,
            { consumed: 920400000, consuming: 11 },
            { consumed: 25630800000, consuming: 11 },
            [usage[1], usage[2]],
            22,
            22,
            { consumed: 684000000, consuming: 8 },
            { consumed: 18655200000, consuming: 8 }
          )
        },
        {
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
          resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          start: 1420249000000,
          end: 1420251000000,
          resources: cresource(
            32,
            32,
            { consumed: 845600000, consuming: 10 },
            { consumed: 23309600000, consuming: 10 },
            [usage[1], usage[3]],
            30,
            30,
            { consumed: 920400000, consuming: 11 },
            { consumed: 25630800000, consuming: 11 }
          )
        }
      ];

      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });

      // Create a test aggregator app
      const app = aggregator(systemToken);

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if (++checks === 2) done();
      };

      let posts = 0;
      postspy = (reqs, cb) => {
        debug('Posted new aggregated usage %o', reqs);

        // Expect aggregated usage to be posted to a sink service
        expect(reqs[0][0]).to.equal('http://localhost:9400/v1/metering/aggregated/usage');
        // Expect the test organization aggregated values
        const org = reqs[0][1].body;
        expect(omit(org, 'id', 'processed', 'processed_id', 'accumulated_usage_id', 'spaces')).to.deep.equal(
          extend({}, omit(aggregated[posts], 'accumulated_usage_id', 'spaces'), {
            organization_id: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28', secured ? 1 : 0].join('-')
          })
        );
        for (let i = 0; i < org.spaces.length; i++) {
          expect(org.spaces[i].space_id).to.equal(aggregated[posts].spaces[i].space_id);
          expect(org.spaces[i].t).to.equal(aggregated[posts].spaces[i].t + '-0-0-0-' + allPosts);
        }
        // Expect the test consumer aggregated values
        const con = reqs[1][1].body;
        expect(omit(con, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
          extend({}, omit(consumers[posts], 'accumulated_usage_id'), {
            organization_id: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28', secured ? 1 : 0].join('-')
          })
        );
        posts = posts + 1;
        allPosts = allPosts + 1;
        cb(undefined, [
          [
            undefined,
            {
              statusCode: 201
            }
          ],
          [
            undefined,
            {
              statusCode: 201
            }
          ]
        ]);

        if (posts === 4) check();
      };

      // Initialize oauth validator spy
      validatorspy = spy((req, res, next) => next());

      // Post accumulated usage to the aggregator
      const post = () => {
        // Post each usage doc
        transform.reduce(
          usage,
          (a, u, i, l, cb) => {
            const uval = extend({}, u, {
              organization_id: ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28', secured ? 1 : 0].join('-')
            });
            // Initialize oauth authorize spy
            authorizespy = spy(function() {});

            request.post(
              'http://localhost::p/v1/metering/accumulated/usage',
              {
                p: server.address().port,
                body: uval
              },
              (err, val) => {
                expect(err).to.equal(undefined);

                // Expect a 201 with the location of the accumulated usage
                expect(val.statusCode).to.equal(201);
                expect(val.headers.location).to.not.equal(undefined);

                // Check oauth authorize spy
                expect(authorizespy.args[0][0]).to.equal(undefined);
                expect(authorizespy.args[0][1]).to.deep.equal(
                  secured
                    ? { system: ['abacus.usage.write'] }
                    : undefined
                );

                // Get accumulated usage back, expecting what we posted
                brequest.get(val.headers.location, {}, (err, val) => {
                  expect(err).to.equal(undefined);
                  expect(val.statusCode).to.equal(200);

                  expect(omit(val.body, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
                    omit(uval, 'id', 'processed', 'processed_id', 'accumulated_usage_id')
                  );

                  // Check oauth authorize spy
                  expect(authorizespy.args[1][0]).to.equal(undefined);
                  expect(authorizespy.args[1][1]).to.deep.equal(
                    secured
                      ? { system: ['abacus.usage.read'] }
                      : undefined
                  );

                  cb();
                });
              }
            );
          },
          undefined,
          () => {
            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 12 : 0);

            check();
          }
        );
      };

      // Run the above steps
      post();
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('does not fail when aggregating to zero', functioncb(function*() {
    const processed = moment.now();
    const startT = processed - 10000;
    const endT = startT + 5000;
    const orgUsage = require('./test-org')(startT - 10000, endT - 10000, processed - 10000);
    const usage = extend({}, accumulatedUsage(
      '0b39fa70-a65f-4183-bae8-385633ca5c87',
      startT,
      endT,
      processed,
      {
        quantity: {
          current: 0, previous: 80
        }
      },
      {
        quantity: {
          current: {
            consumed: 518400000,
            consuming: 6,
            since: 1420243200000
          }
        }
      },
      {
        quantity: {
          current: {
            consumed: 13996800000,
            consuming: 6,
            since: 1420243200000
          }
        }
      }
    ),
    { processed_id: processed + '-0-0-0-0' });
    clock.restore();

    let err;
    let res;
    try {
      res = yield aggregator.aggregate([orgUsage, null], usage);
    } catch (e) {
      err = e;
    }

    expect(err).to.be.equal(undefined);
    expect(res).to.not.be.undefined;
  }));

  it('throws error if aggregatorFn returns null, undefined or NaN', functioncb(function*() {
    const processed = moment.now();
    const startT = processed - 10000;
    const endT = startT + 5000;
    const orgUsage = require('./test-org')(startT - 10000, endT - 10000, processed - 10000);
    const aggrUsage = extend({}, accumulatedUsage(
      '0b39fa70-a65f-4183-bae8-385633ca5c87',
      startT,
      endT,
      processed,
      { quantity: { current: NaN }, cost: 24 },
      {
        quantity: {
          current: {
            consumed: 518400000,
            consuming: 6,
            since: 1420243200000
          }
        },
        cost: { consumed: 518400000, consuming: 6, price: 0.00014 }
      },
      {
        quantity: {
          current: {
            consumed: 13996800000,
            consuming: 6,
            since: 1420243200000
          }
        },
        cost: { consumed: 13996800000, consuming: 6, price: 0.00014 }
      }
    ),
    { processed_id: processed + '-0-0-0-0' });
    clock.restore();
    for(let val of [NaN, null, undefined]) {
      aggrUsage.accumulated_usage[0].windows[3][0].quantity.current = val;
      let err;
      try {
        yield aggregator.aggregate([orgUsage, null], aggrUsage);
      } catch (e) {
        err = e;
      }
      expect(err).to.not.be.undefined;
      expect(err.message).to.equal('Aggregation resulted in invalid value: NaN');
      expect(err.status).to.equal(422);
    }
  }));

  it('aggregates only to its relevant windows', (done) => {
    let records = 0;
    clock.restore();
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 9, 31, 2), // October 31, 2015 2:00:00 AM
      toFake: ['Date']
    });
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
      accumulatedUsage('bounds', 1446249600000, 1446256800000, 1446256700000),
      accumulatedUsage('bounds', 1446336000000, 1446256800000, 1446418700000),
      accumulatedUsage('bounds', 1446422400000, 1446256800000, 1446418700000)
    ];
    usage[0].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [octDay, null, null], [octMonth, null]]
      }
    ];
    usage[1].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [nov1Day, octDay, null], [nov1Month, octMonth]]
      }
    ];
    usage[2].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [nov2Day, octDay, null], [nov2Month, octMonth]]
      }
    ];

    // Create a test aggregator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postNov = () => {
      clock.restore();
      clock = sinon.useFakeTimers({
        now: Date.UTC(2015, 10, 1, 23), // November 1, 2015 11:00:00 PM
        toFake: ['Date']
      });
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: usage[1]
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          request.post(
            'http://localhost::p/v1/metering/accumulated/usage',
            {
              p: server.address().port,
              body: usage[2]
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(201);
            }
          );
        }
      );
    };

    postspy = (reqs, cb) => {
      records++;
      if (records === 1)
        postNov();
      if (records === 3) {
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows[4][1]).to.be.null;
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows[3][1]).to.be.null;

        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows[4][0]).to.not.be.null;
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows[3][0]).to.not.be.null;
        done();
      }

      cb(undefined, [[undefined, { statusCode: 201 }], [undefined, { statusCode: 201 }]]);
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage[0]
      },
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
      }
    );
  });

  it('selects the correct time window to aggregate to', (done) => {
    let records = 0;
    clock.restore();
    clock = sinon.useFakeTimers({
      now: Date.UTC(2016, 0, 31, 12), // January 31, 2016 12:00:00 PM
      toFake: ['Date']
    });
    const jan1Day = {
      quantity: {
        current: { consumed: 172800000, consuming: 2, since: 1454198400000 }
      }
    };
    const jan1Month = {
      quantity: {
        current: { consumed: -5011200000, consuming: 2, since: 1454198400000 }
      }
    };
    const jan2Day = {
      quantity: {
        previous: { consumed: 172800000, consuming: 2, since: 1454198400000 },
        current: { consumed: 144000000, consuming: 1, since: 1454227200000 }
      }
    };
    const jan2Month = {
      quantity: {
        previous: { consumed: -5011200000, consuming: 2, since: 1454198400000 },
        current: { consumed: -2448000000, consuming: 1, since: 1454227200000 }
      }
    };
    const febDay = {
      quantity: {
        current: { consumed: 115200000, consuming: 2, since: 1454299200000 }
      }
    };
    const febMonth = {
      quantity: {
        current: { consumed: 4953600000, consuming: 2, since: 1454299200000 }
      }
    };
    const usage = [
      accumulatedUsage('bounds', 1454198400000, 1454198400000, 1454198400000),
      accumulatedUsage('bounds', 1454227200000, 1454227200000, 1454313600000),
      accumulatedUsage('bounds', 1454299200000, 1454299200000, 1454313600000)
    ];
    usage[0].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [jan1Day, null, null], [jan1Month, null]]
      }
    ];
    usage[1].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [null, jan2Day, null], [null, jan2Month]]
      }
    ];
    usage[2].accumulated_usage = [
      {
        metric: 'memory',
        windows: [[null], [null], [null], [febDay, jan2Day, null], [febMonth, jan2Month]]
      }
    ];

    // Create a test aggregator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postFeb = () => {
      clock.restore();
      clock = sinon.useFakeTimers({
        now: Date.UTC(2016, 1, 1, 8), // February 1, 2016 8:00:00 AM
        toFake: ['Date']
      });
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: usage[1]
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          request.post(
            'http://localhost::p/v1/metering/accumulated/usage',
            {
              p: server.address().port,
              body: usage[2]
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(201);
            }
          );
        }
      );
    };

    const expected = [
      [null],
      [null],
      [null],
      [
        {
          quantity: { consuming: 2, consumed: 115200000 },
          previous_quantity: null
        },
        null,
        null
      ],
      [
        {
          quantity: { consuming: 2, consumed: 4953600000 },
          previous_quantity: null
        },
        null
      ]
    ];

    postspy = (reqs, cb) => {
      records++;
      if (records === 1) postFeb();
      if (records === 3) {
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows).to.deep.equal(expected);
        done();
      }

      cb(undefined, [
        [
          undefined,
          {
            statusCode: 201
          }
        ],
        [
          undefined,
          {
            statusCode: 201
          }
        ]
      ]);
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage[0]
      },
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
      }
    );
  });

  it('shifts all windows successfully', (done) => {
    clock.restore();
    clock = sinon.useFakeTimers({
      now: Date.UTC(2016, 3, 30),
      toFake: ['Date']
    });
    let records = 0;
    const usage = [
      accumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
      accumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
      accumulatedUsage('bounds', 1462060800000, 1462060800000, 1462060800000)
    ];
    const body = () => {
      return extend(
        {},
        {
          metric: 'heavy_api_calls',
          windows: [
            [null],
            [null],
            [null],
            [{ quantity: { current: 500 } }, null, null],
            [{ quantity: { current: 500 } }, null]
          ]
        }
      );
    };
    usage[0].accumulated_usage = [body()];
    usage[1].accumulated_usage = [body()];
    usage[2].accumulated_usage = [body()];
    usage[1].plan_id = 'standard';

    // Expected values for the different levels of aggregation
    const expectedBasic = {
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: 500, previous_quantity: null }, null, null],
        [{ quantity: 500, previous_quantity: null }, null]
      ]
    };

    // Create a test aggregator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    postspy = (reqs, cb) => {
      records++;
      if (records === 3) {
        const org = reqs[0][1].body;
        expect(org.resources[0].plans[0].aggregated_usage[0]).to.deep.equal(expectedBasic);
        expect(org.resources[0].plans[1]).to.be.undefined;
        done();
      }

      cb(undefined, [
        [
          undefined,
          {
            statusCode: 201
          }
        ],
        [
          undefined,
          {
            statusCode: 201
          }
        ]
      ]);
    };

    const post = (u, done) => {
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: u
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          if (done) done();
        }
      );
    };
    post(usage[0], () =>
      post(usage[1], () => {
        clock = sinon.useFakeTimers({
          now: Date.UTC(2016, 4, 1), // May 1, 2016 12:00:00 AM
          toFake: ['Date']
        });
        post(usage[2]);
      })
    );
  });

  it('attaches error and reasons when there is a business error', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 5),
      toFake: ['Date']
    });

    // Create a test accumulator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if (++checks === 2) done();
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
      metering_plan_id: 'invalidMeteringPlan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [
          {
            name: 'heavy_api_calls',
            price: 1
          }
        ]
      },
      accumulated_usage: [
        {
          metric: 'heavy_api_calls',
          windows: [[null], [null], [null], [5, null, null], [5, null]]
        }
      ]
    };

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal('http://localhost:9880/v1/metering/plans/:metering_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        metering_plan_id: 'invalidMeteringPlan'
      });
      cb(undefined, [
        [
          undefined,
          {
            statusCode: 404
          }
        ]
      ]);

      check();
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage
      },
      (err, val) => {
        expect(val).to.equal(undefined);
        expect(err).to.be.an('Error');
        expect(err).to.have.property('code', 500);
        expect(err).to.have.property('statusCode', 500);
        expect(err).to.have.property('error', 'emplannotfound');
        expect(err).to.have.property('reason', 'Metering plan with id invalidMeteringPlan not found');
        expect(err).to.have.property('cause').that.deep.equals({
          statusCode: 404
        });

        // Get normalized usage back, expecting what we posted
        request.get(err.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          expect(omit(val.body, 'id', 'processed', 'processed_id', 'accumulated_usage_id')).to.deep.equal(
            omit(usage, 'id')
          );

          check();
        });
      }
    );
  });

  it('takes error and reason from the sink and returns it', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 5),
      toFake: ['Date']
    });

    // Create a test accumulator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if (++checks === 2) done();
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
        metrics: [
          {
            name: 'heavy_api_calls',
            price: 1
          }
        ]
      },
      accumulated_usage: [
        {
          metric: 'heavy_api_calls',
          windows: [
            [null],
            [null],
            [null],
            [{ quantity: { previous: null, current: 5 } }, null, null],
            [{ quantity: { previous: null, current: 5 } }, null]
          ]
        }
      ]
    };

    postspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal('http://localhost:9400/v1/metering/aggregated/usage');

      // Simulates business error in abacus-aggregator
      cb(undefined, [
        [
          undefined,
          {
            statusCode: 201,
            body: {
              error: 'emplannotfound',
              reason: 'Metering plan with id test-metering-plan not found',
              cause: {
                statusCode: 404
              }
            }
          }
        ],
        [
          undefined,
          {
            statusCode: 201
          }
        ]
      ]);

      check();
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: usage
      },
      (err, val) => {
        expect(val).to.equal(undefined);
        expect(err).to.be.an('Error');
        expect(err).to.have.property('code', 500);
        expect(err).to.have.property('statusCode', 500);
        expect(err).to.have.property('error', 'esink');
        expect(err).to.have.property('reason').that.deep.equals([
          {
            error: 'emplannotfound',
            reason: 'Metering plan with id test-metering-plan not found',
            cause: {
              statusCode: 404
            }
          }
        ]);

        // Get normalized usage back, expecting what we posted
        request.get(err.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          expect(omit(val.body, 'id', 'processed', 'processed_id')).to.deep.equal(usage);

          check();

        });
      }
    );
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

    usage[0].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 100 } }, null],
          [{ quantity: { current: 100 } }, null]
        ]
      }
    ];
    usage[1].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 200 } }, { quantity: { current: 100 } }],
          [{ quantity: { previous: 100, current: 300 } }, null]
        ]
      }
    ];

    usage[2].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 300 } }, { quantity: { current: 200 } }],
          [{ quantity: { current: 300 } }, { quantity: { previous: 100, current: 300 } }]
        ]
      }
    ];

    usage[3].accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [
          [null],
          [null],
          [null],
          [{ quantity: { current: 400 } }, { quantity: { current: 300 } }],
          [
            { quantity: { previous: 300, current: 700 } },
            { quantity: { previous: 100, current: 300 } }
          ]
        ]
      }
    ];

    // Expected values for the plan aggregation
    const expectedBasic = {
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [null, { quantity: 400, previous_quantity: null }],
        [{ quantity: 700, previous_quantity: 300 }, null]
      ]
    };

    // Create a test aggregator app
    const app = aggregator(systemToken);

    // Listen on an ephemeral port
    const server = app.listen(0);

    postspy = (reqs, cb) => {
      records++;
      cb(undefined, [
        [
          undefined,
          {
            statusCode: 201
          }
        ],
        [
          undefined,
          {
            statusCode: 201
          }
        ]
      ]);
      if (records === 4) {
        const org = reqs[0][1].body;
        expect(org.resources[0].plans[0].aggregated_usage[0]).to.deep.equal(expectedBasic);
        done();
      }
    };

    const post = (u, done) => {
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: u
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          if (done) done();
        }
      );
    };

    const fakeClock = (usage) => sinon.useFakeTimers({
      now: usage.processed + 1,
      toFake: ['Date']
    });

    clock = fakeClock(usage[0]);
    post(usage[0], () => {
      clock = fakeClock(usage[1]);
      post(usage[1], () => {
        clock = fakeClock(usage[2]);
        post(usage[2], () => {
          clock = fakeClock(usage[3]);
          post(usage[3], () => {});
        });
      });
    });
  });
});
