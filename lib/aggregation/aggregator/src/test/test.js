'use strict';

// Usage aggregator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const { extend, omit, map } = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
// const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-oauth');
const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
// const functioncb = require('abacus-yieldable').functioncb;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-aggregator-test');

// const { currentMonthWindow, previousMonthWindow, 
//   currentDayWindow, previousDayWindow } = require('./parse-aggregator-responses');
const { buildAccumulatedUsage } = require('./templates');  
// const { octDay, octMonth, nov1Day, nov1Month, nov2Day, nov2Month, jan1Day, jan1Month,
//   jan2Day, jan2Month, febDay, febMonth } = require('./fixtures'); 
const { correctWindowsTestFixtures, shiftWindowsTestFixtures } = require('./fixtures'); 
/* eslint handle-callback-err: 0 */

process.env.SINK = 'http://localhost:9400';
// unset all SAMPLING configurations
delete process.env.SAMPLING;

// Mock the cluster module
// require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster, {
//   single: spy()
// });

const stubCluster = () => {
  const clusterStub = stubModule('abacus-cluster');
  clusterStub.stubMainFunc((fn) => fn);
};

const startAggregator = () => {
  aggregator = require('..');
  const app = aggregator(() => {});
  server = app.listen(0);
};


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

let aggregator; // = require('..');
let server;

// Expected output plan id
const pid = 'basic/test-metering-plan/test-rating-plan/test-pricing-basic';
const testResourceInstanceID = '0b39fa70-a65f-4183-bae8-385633ca5c87';
const testOrgID = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
const testSpaceID = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const testConsumerID = 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';


const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-aggregator', () => {
  let clock;
  const systemToken = () => {};

  before(() => {
    // Delete test dbs on the configured db server
    stubCluster();
  });

  beforeEach((done) => {
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 12),
      toFake: ['Date']
    });
    dbclient.drop(dbEnv, /^abacus-aggregator-/, done);

  });

  afterEach(() => {
    server.close();
    clock.restore();
  });

  // context('when aggregates usage for organization', () => {
  //   beforeEach(() => {

  //   });

  //   it('with one resource', () => {

  //   });
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
      buildAccumulatedUsage(
        testResourceInstanceID,
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
      buildAccumulatedUsage(
        testResourceInstanceID,
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
            current: { 
              consumed: 684000000, 
              consuming: 8, 
              since: 1420245000000 }
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
      buildAccumulatedUsage(
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
      buildAccumulatedUsage(
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
          organization_id: testOrgID,
          account_id: '1234',
          consumer_id: testConsumerID,
          resource_instance_id: testResourceInstanceID,
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
              space_id: testSpaceID,
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: testOrgID,
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          consumer_id: testConsumerID,
          resource_instance_id: testResourceInstanceID,
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
              space_id: testSpaceID,
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: testOrgID,
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          accumulated_usage_id: '224',
          consumer_id: testConsumerID,
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
              space_id: testSpaceID,
              t: '0001420286400000'
            }
          ]
        },
        {
          organization_id: testOrgID,
          account_id: '1234',
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          accumulated_usage_id: '225',
          consumer_id: testConsumerID,
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
              space_id: testSpaceID,
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
          consumer_id: testConsumerID,
          organization_id: testOrgID,
          start: 1420243200000,
          end: 1420245000000,
          resource_instance_id: testResourceInstanceID,
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
          consumer_id: testConsumerID,
          organization_id: testOrgID,
          resource_id: 'test-resource',
          plan_id: 'basic',
          pricing_country: 'USA',
          prices: {
            metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
          },
          start: 1420245000000,
          end: 1420247000000,
          resource_instance_id: testResourceInstanceID,
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
          consumer_id: testConsumerID,
          organization_id: testOrgID,
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
          consumer_id: testConsumerID,
          organization_id: testOrgID,
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

      // // Create a test aggregator app
      // const app = aggregator(systemToken);

      // // Listen on an ephemeral port
      // const server = app.listen(0);

      startAggregator();

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
            organization_id: [testOrgID, secured ? 1 : 0].join('-')
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
            organization_id: [testOrgID, secured ? 1 : 0].join('-')
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
              organization_id: [testOrgID, secured ? 1 : 0].join('-')
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

  // });

  it('selects the correct time window to aggregate to', (done) => {
    let records = 0;
    clock.restore();
    clock = sinon.useFakeTimers({
      now: Date.UTC(2016, 0, 31, 12), // January 31, 2016 12:00:00 PM
      toFake: ['Date']
    });

    startAggregator();

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
          body: correctWindowsTestFixtures.usage[1]
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          request.post(
            'http://localhost::p/v1/metering/accumulated/usage',
            {
              p: server.address().port,
              body: correctWindowsTestFixtures.usage[2]
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
      if (records === 1) postFeb();
      if (records === 3) {
        expect(reqs[0][1].body.resources[0].plans[0].aggregated_usage[0].windows).to.deep.equal(
          correctWindowsTestFixtures.expected);
        done();
      }

      cb(undefined, [[ undefined, { statusCode: 201 }],
        [ undefined, { statusCode: 201 }]]);
    };

    request.post(
      'http://localhost::p/v1/metering/accumulated/usage',
      {
        p: server.address().port,
        body: correctWindowsTestFixtures.usage[0]
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

    startAggregator();
    postspy = (reqs, cb) => {
      records++;
      if (records === 3) {
        const org = reqs[0][1].body;
        expect(org.resources[0].plans[0].aggregated_usage[0]).to.deep.equal(shiftWindowsTestFixtures.expected);
        expect(org.resources[0].plans[1]).to.be.undefined;
        done();
      }

      cb(undefined, [[ undefined, { statusCode: 201 }],
        [ undefined, { statusCode: 201 }]]);
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
    post(shiftWindowsTestFixtures.usage[0], () =>
      post(shiftWindowsTestFixtures.usage[1], () => {
        clock = sinon.useFakeTimers({
          now: Date.UTC(2016, 4, 1), // May 1, 2016 12:00:00 AM
          toFake: ['Date']
        });
        post(shiftWindowsTestFixtures.usage[2]);
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

    // // Create a test accumulator app
    // const app = aggregator(systemToken);

    // // Listen on an ephemeral port
    // const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      console.log('=======>');
      if (++checks === 2) done();
    };

    const usage = {
      collected_usage_id: 'collector-id',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: 14202432000034,
      end: 1420243200034,
      plan_id: 'basic',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-errorcf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-errorb6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-errorbab',
      resource_type: 'test-resource-type',
      account_id: '12345',
      pricing_country: 'USA',
      metering_plan_id: 'invalid-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic'
    };

    usage.accumulated_usage = [
      {
        metric: 'heavy_api_calls',
        windows: [[null], [null], [null], [5, null, null], [5, null]]
      }
    ];

    getspy = (reqs, cb) => {
      console.log('in get spy');
      console.log('%j', reqs);
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal('http://localhost:9880/v1/metering/plans/:metering_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        metering_plan_id: 'invalid-metering-plan'
      });
      cb(undefined, [[ undefined, { statusCode: 404 }]]);

      check();
    };
    
    startAggregator();
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
        expect(err).to.have.property('reason', 'Metering plan with id invalid-metering-plan not found');
        expect(err).to.have.property('cause').that.deep.equals({
          statusCode: 404
        });
        console.log(err.headers.location);
        // Get normalized usage back, expecting what we posted
        request.get(err.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          console.log('%j', val);
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
      buildAccumulatedUsage('p', 1467244799999, 1467244799999, 1467244799999),
      buildAccumulatedUsage('p', 1467331199999, 1467331199999, 1467331199999),
      buildAccumulatedUsage('p', 1467417599999, 1467417599999, 1467417599999),
      buildAccumulatedUsage('p', 1467503999999, 1467503999999, 1467503999999)
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
