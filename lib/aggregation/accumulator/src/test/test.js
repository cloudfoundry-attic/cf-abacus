'use strict';

// Usage accumulator service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const omit = _.omit;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-accumulator-test');

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and aggregator service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.AGGREGATOR = 'http://localhost::port';
process.env.SLACK = '2D';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, {
    single: spy()
  });

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

const accumulator = require('..');

// Utility functions that compute a time from now
const now = new Date();
const today = (h) => Date.UTC(
  now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h);
const yesterday = (h) => Date.UTC(
  now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, h);

describe('abacus-usage-accumulator', () => {
  it('accumulates usage over time', function(done) {
    this.timeout(60000);
    cachespy = spy(() => {
      const f = () => undefined;
      f.start = () => undefined;
      return f;
    });


    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Define a sequence of usage for a resource instance, usage 222 and
    // 223 represent usage for two consecutive time periods, then usage
    // 224 comes as a duplicate of usage 222 and should be skipped
    const usage = [
      {
        normalized_usage_id: '332',
        collected_usage_id: '555',
        metered_usage_id: '422',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: today(0),
        end: today(1),
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
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 0.01
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
      },
      {
        normalized_usage_id: '333',
        collected_usage_id: '555',
        metered_usage_id: '423',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: today(1),
        end: today(2),
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
          quantity: 4
        }, {
          measure: 'running_instances',
          quantity: 1
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 0.01
        }, {
          metric: 'heavy_api_calls',
          quantity: 20
        }, {
          metric: 'memory',
          quantity: {
            consuming: 4,
            since: 1420245000000
          }
        }]
      },
      {
        normalized_usage_id: '334',
        collected_usage_id: '555',
        metered_usage_id: '424',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: today(0),
        end: today(1),
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
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 0.01
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
      },
      {
        normalized_usage_id: '335',
        collected_usage_id: '555',
        metered_usage_id: '425',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: today(2),
        end: today(3),
        plan_id: 'standard',
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
          quantity: 4
        }, {
          measure: 'running_instances',
          quantity: 2
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 0.01
        }, {
          metric: 'heavy_api_calls',
          quantity: 20
        }, {
          metric: 'memory',
          quantity: {
            consuming: 8,
            since: 1420246800000
          }
        }]
      },
      {
        normalized_usage_id: '336',
        collected_usage_id: '555',
        metered_usage_id: '426',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: yesterday(2),
        end: yesterday(3),
        plan_id: 'standard',
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
          quantity: 4
        }, {
          measure: 'running_instances',
          quantity: 1
        }],
        metered_usage: [{
          metric: 'storage',
          quantity: 1
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 0.01
        }, {
          metric: 'heavy_api_calls',
          quantity: 20
        }, {
          metric: 'memory',
          quantity: {
            consuming: 4,
            since: 1420246500000
          }
        }]
      }];

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 3) done();
    };

    postspy = (reqs, cb) => {
      debug('Posted new accumulated usage %o', reqs);

      // Expect accumulated usage to be posted to the aggregator service
      expect(reqs[0][0])
        .to.equal('http://localhost:9200/v1/metering/accumulated/usage');

      // Expect accumulated values
      const val = reqs[0][1];
      if(val.body.plan_id === 'basic') {
        // Build the Basic quantities for the second, minute, hour windows
        const buildBasic = (i, p, t) => {
          // The accumulated values that are possible
          const oneaccum = t ? {
            current: { consumed: 0, consuming: 6, since: 1420243200000 }
          } : { current: 0.01 };
          const twoaccum = t ? {
            previous: { consumed: 0, consuming: 6, since: 1420243200000 },
            current: { consumed: 10800000, consuming: 4, since: 1420245000000 }
          } : { current: 0.02, previous: 0.01 };

          // Change the return value based on the window
          const windowvalues = {
            0: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 1, 0, 1))
                return twoaccum;
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 2, 0, 1))
                return oneaccum;
              return 0;
            },
            1: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 1, 1))
                return twoaccum;
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 2, 1))
                return oneaccum;
              return 0;
            },
            2: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 2))
                return twoaccum;
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 3))
                return oneaccum;
              return 0;
            }
          };
          return [windowvalues[i]()];
        };

        try {
          const expected1 = [
            buildBasic(0, val.body.processed),
            buildBasic(1, val.body.processed),
            buildBasic(2, val.body.processed),
            [{
              previous: 0.01,
              current: 0.02
            }, 0, 0],
            [{
              previous: 0.01,
              current: 0.02
            }, 0]]

          debug('Accumulated basic usage[1] %o',
            val.body.accumulated_usage[1].quantity);
          debug('Expected basic usage[1] %o', expected1);

          expect(val.body.accumulated_usage[1].quantity)
            .to.deep.equal(expected1);

          const expected3 = [
            buildBasic(0, val.body.processed),
            buildBasic(1, val.body.processed, true),
            buildBasic(2, val.body.processed, true),
            [{
              previous: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              current: {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              }
            }, 0, 0],
            [{
              previous: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              current: {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              }
            }, 0]];

          debug('Accumulated basic usage[3] %o',
            val.body.accumulated_usage[3].quantity);
          debug('Expected basic usage[3] %o', expected3);

          /*
          expect(val.body.accumulated_usage[3].quantity)
            .to.deep.equal(expected3);
          */

          debug('Matched expected accumulated usage for plan %s',
            val.body.plan_id);
          check();
        }
        catch(e) {
          debug('Unmatched usage %o', e);
        }
      }

      if(val.body.plan_id === 'standard') {
        // Build the Standard quantities for the second, minute, hour windows
        const buildStandard = (i, p, t) => {
          // The accumulated values that are possible
          const accum = t ? {
            current: { consumed: 0, consuming: 8, since: 1420246800000 }
          } : { current: 0.01 };

          // Change the return value based on the window
          const windowvalues = {
            0: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 3, 0, 1))
                return accum;
              return 0;
            },
            1: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 3, 1))
                return accum;
              return 0;
            },
            2: () => {
              if(p < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
                now.getUTCDate(), 4))
                return accum;
              return 0;
            }
          };
          return [windowvalues[i]()];
        };
        try {
          const expected1 = [
            buildStandard(0, val.body.processed),
            buildStandard(1, val.body.processed),
            buildStandard(2, val.body.processed),
            [{ current: 0.01 }, { current: 0.01 }, 0], []
          ];
          const expected3 = [
            buildStandard(0, val.body.processed),
            buildStandard(1, val.body.processed),
            buildStandard(2, val.body.processed),
            [
              { current: { consumed: 0, consuming: 8, since: 1420246800000 } },
              { current: { consumed: 0, consuming: 4, since: 1420246500000 } },
              0
            ], []
          ];
          // Change the expected value depending on if the test
          // is being run in the beginning of the month or not
          if(now.getUTCDate() === 1) {
            expected1[4].push({ current: 0.01 });
            expected1[4].push({ current: 0.01 });
            expected3[4].push({ current:
              { consumed: 0, consuming: 8, since: 1420246800000 } });
            expected3[4].push({ current:
              { consumed: 0, consuming: 4, since: 1420246500000 } });
          }
          else {
            expected1[4].push({ current: 0.02, previous: 0.01 });
            expected1[4].push(0);
            expected3[4].push({ current:
              { consumed: -2400000, consuming: 4, since: 1420246500000 },
              previous: { consumed: 0, consuming: 8, since: 1420246800000 }
            });
            expected3[4].push(0);
          }

          debug('Accumulated standard usage[1] %o',
            val.body.accumulated_usage[1].quantity);
          debug('Expected standard usage[1] %o', expected1);

          expect(val.body.accumulated_usage[1].quantity)
            .to.deep.equal(expected1);

          debug('Accumulated standard usage[3] %o',
            val.body.accumulated_usage[3].quantity);
          debug('Expected standard usage[3] %o', expected3);

          /*
          expect(val.body.accumulated_usage[3].quantity)
            .to.deep.equal(expected3);
          */

          debug('Matched expected accumulated usage for plan %s',
            val.body.plan_id);
          check();
        }
        catch(e) {
          debug('Unmatched usage %o', e);
        }
      }

      cb(undefined, [[undefined, {
        statusCode: 200
      }]]);
    };

    // Initialize oauth spies
    validatorspy = spy((req, res, next) => next());
    authorizespy = spy(function() {});

    // Post usage to the accumulator
    const post = () => {
      transform.reduce(usage, (a, u, i, l, cb) =>
        request.post('http://localhost::p/v1/metering/metered/usage', {
          p: server.address().port,
          body: u
        }, (err, val) => {
          expect(err).to.equal(undefined);

          // Expect a 201 with the location of the accumulated usage
          if(i !== 2) {
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Get metered usage back, expecting what we posted
            request.get(val.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(
                val.body, 'id', 'processed')).to.deep.equal(usage[i]);
              cb();
            });

          }
          else {
            // Expect a 409 reporting duplicate usage
            expect(val.statusCode).to.equal(409);
            cb();
          }

        }), undefined, check);
    };

    // Run the above steps
    post();
  });

  it('accumulates usage using unsecured and secured server', function(done) {
    this.timeout(60000);

    const metered = {
      normalized_usage_id: '332',
      collected_usage_id: '555',
      metered_usage_id: '422',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
      start: Date.UTC(now.getUTCFullYear(),
        now.getUTCMonth(), now.getUTCDate(), 0),
      end: Date.UTC(now.getUTCFullYear(),
        now.getUTCMonth(), now.getUTCDate(), 1),
      plan_id: 'basic',
      region: 'us',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      metered_usage: [{
        metric: 'storage',
        quantity: 1
      }, {
        metric: 'thousand_light_api_calls',
        quantity: 0.01
      }, {
        metric: 'heavy_api_calls',
        quantity: 20
      }]
    };

    const verify = (secured, done) => {
      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });

      // Create a test accumulator app
      const app = accumulator();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Initialize oauth spies
      validatorspy = spy((req, res, next) => next());
      authorizespy = spy(function() {});

      // Post usage for a resource, expecting a 201 response
      request.post('http://localhost::p/v1/metering/metered/usage', {
        p: server.address().port,
        body: extend({}, metered, { end: 1420245000000 + (secured ? 2 : 1) })
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        // Check oauth validator and authorize spy
        expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
        expect(authorizespy.args[0][0]).to.equal(undefined);
        expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
          system: ['abacus.usage.write']
        } : undefined);

        // Get usage, expecting what we posted
        brequest.get(val.headers.location, {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 3 : 0);
          expect(authorizespy.args[1][0]).to.equal(undefined);
          expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
            system: ['abacus.usage.read']
          } : undefined);

          done();
        });
      });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
});
