'use strict';

// Usage accumulator service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');

const extend = _.extend;
const omit = _.omit;
const map = _.map;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-accumulator-test');

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and aggregator service URL
process.env.DB = process.env.DB || 'test';
process.env.AGGREGATOR = 'http://localhost:9300';

// Configure test slack window
process.env.SLACK = '2D';

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

// Initialize oauth spies
validatorspy = spy((req, res, next) => next());
authorizespy = spy(function() {});

const accumulator = require('..');

const selectprice = (pp) => pp === 'test-pricing-basic';

// Metered usage template
// Takes in usage#, start, end, plan id, storage, light api calls,
// heavy api calls quantity, and memory quantity
const usageTemplate = (u, s, e, p, mp, rp, pp, st, lapi, hapi, mem, pmem) => ({
  normalized_usage_id: (330 + u).toString(),
  start: s,
  end: e,
  collected_usage_id: '555',
  metered_usage_id: (422 + u).toString(),
  resource_id: 'test-resource',
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  plan_id: p,
  resource_type: 'test',
  account_id: '1234',
  pricing_country: 'USA',
  metering_plan_id: mp,
  rating_plan_id: rp,
  pricing_plan_id: pp,
  prices: {
    metrics: [
      { name: 'storage', price: selectprice(pp) ? 1 : 0.50 },
      { name: 'thousand_light_api_calls',
        price: selectprice(pp) ? 0.03 : 0.04 },
      { name: 'heavy_api_calls', price: selectprice(pp) ? 0.15 : 0.18 },
      { name: 'memory', price: selectprice(pp) ? 0.00014 : 0.00028 }
    ]
  },
  metered_usage: [
    { metric: 'storage', quantity: st },
    { metric: 'thousand_light_api_calls', quantity: lapi },
    { metric: 'heavy_api_calls', quantity: hapi },
    { metric: 'memory', quantity: { consuming: mem, previous_consuming: pmem } }
  ]
});

describe('abacus-usage-accumulator', () => {
  let clock;

  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-accumulator-/, done);
  });

  afterEach(() => {
    clock.restore();
  });

  it('accumulates usage over time', (done) => {
    debug('accumulate over time: starting test ...');

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 5), 'Date');
    // Returns 2015-01-03 with the given hour for testing
    const time = (h) => Date.UTC(2015, 0, 3, h);

    // Define a sequence of usage for a resource instance:
    // usage 330 and 331 represent usage for two consecutive time periods,
    // then usage 332 comes as a duplicate of usage 330 and should be skipped,
    // usage 333 and 334 represent usage for two consecutive days for a
    // different plan than the first set,
    // usage 335 represent usage for a different consumer, but otherwise
    // same as usage 333 and should not be skipped as duplicate and should be
    // accumulated separately
    const usage = [
      usageTemplate(0, time(0), time(0), 'basic', 'test-metering-plan',
        'test-rating-plan', 'test-pricing-basic', 1, 0.03, 20, 6, 0),
      usageTemplate(1, time(1), time(1), 'basic', 'test-metering-plan',
        'test-rating-plan', 'test-pricing-basic', 1, 0.03, 20, 8, -6),
      usageTemplate(2, time(0), time(0), 'basic', 'test-metering-plan',
        'test-rating-plan', 'test-pricing-basic', 1, 0.01, 20, 6, 0),
      usageTemplate(3, time(2), time(2), 'standard', 'test-metering-plan',
        'test-rating-plan', 'test-pricing-standard', 1, 0.01, 20, 5, -4),
      usageTemplate(4, time(-22), time(-22), 'standard',
        'test-metering-plan', 'test-rating-plan',
        'test-pricing-standard', 1, 0.01, 20, 4, 0),
      extend(usageTemplate(5, time(2), time(2), 'standard',
        'test-metering-plan', 'test-rating-plan',
        'test-pricing-standard', 1, 1, 200, 40, 0), {
          consumer_id: 'external:cceae239-f3f8-483c-9dd0-de6781c38bcc'
        })
    ];

    // Possible expected accumulated values
    // Summary = running summarize fn at the given since
    // 0 & 1: Consuming 6 for an hour, then updated to consume 8.
    //        summary: 6 * 1 ~> 6
    // 2: skipped because of duplicate.
    // 3 & 4: accumulated differently. Consuming 4 for 24 hours, then updated
    //        to consume 5. Summary: 4 * 24 ~> 96
    // 5: accumulated differently. Consuming 40. Summary: 40 * 0 ~> 0
    const expected = [{
      metric: 'thousand_light_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { previous: 0.03, current: 0.06 }, cost: 0.0018 },
          null, null],
        [{ quantity: { previous: 0.03, current: 0.06 }, cost: 0.0018 },
          null]]
    }, {
      metric: 'memory',
      windows: [
        [null],
        [null],
        [null],
        [{
          quantity: {
            previous: { consumed: 518400000, consuming: 6,
              since: 1420243200000 },
            current: { consumed: 676800000, consuming: 8, since: 1420246800000 }
          },
          cost: { consumed: 676800000, consuming: 8, price: 0.00014 }
        }, null, null],
        [{
          quantity: {
            previous: { consumed: 13996800000, consuming: 6,
              since: 1420243200000 },
            current: { consumed: 18648000000, consuming: 8,
              since: 1420246800000 }
          },
          cost: { consumed: 18648000000, consuming: 8, price: 0.00014 }
        }, null]]
    }, {
      metric: 'thousand_light_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { current: 0.01 }, cost: 0.0004 },
          { quantity: { current: 0.01 }, cost: 0.0004 },
          null],
        [{ quantity: { previous: 0.01, current: 0.02 }, cost: 0.0008 },
          null]]
    }, {
      metric: 'memory',
      windows: [
        [null],
        [null],
        [null],
        [{
          quantity: {
            current: { consumed: 72000000, consuming: 5, since: 1420250400000 }
          },
          cost: { consumed: 72000000, consuming: 5, price: 0.00028 }
        }, {
          quantity: {
            current: { consumed: 288000000, consuming: 4, since: 1420164000000 }
          },
          cost: { consumed: 288000000, consuming: 4, price: 0.00028 }
        }, null],
        [{
          quantity: {
            previous: { consumed: 2318400000, consuming: 5,
              since: 1420250400000 },
            current: { consumed: 12283200000, consuming: 5,
              since: 1420250400000 }
          },
          cost: { consumed: 12283200000, consuming: 5, price: 0.00028 }
        }, null]]
    }, {
      metric: 'thousand_light_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { current: 1 }, cost: 0.04 },
          null, null ],
        [{ quantity: { current: 1 }, cost: 0.04 },
          null]]
    }, {
      metric: 'memory',
      windows: [
        [null],
        [null],
        [null],
        [{
          quantity: {
            current: { consumed: 2880000000, consuming: 40,
              since: 1420250400000 }
          },
          cost: { consumed: 2880000000, consuming: 40, price: 0.00028 }
        }, null, null],
        [{
          quantity: {
            current: { consumed: 92736000000, consuming: 40,
              since: 1420250400000 }
          },
          cost: { consumed: 92736000000, consuming: 40, price: 0.00028 }
        }, null]]
    }];

    // Verify secured or unsecured accumulator
    const verify = (secured, done) => {
      debug('accumulate over time: starting verify ...');
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

      debug('accumulate over time: verify -> accumulator started on port %d',
        server.address().port);

      // Handle callback checks and at the end, verify the expectation
      // of sink payload
      let checks = 0, matched = 0, unmatched = 0;
      const check = () => {
        if(++checks == 6) {
          expect(matched).to.equal(3);
          expect(unmatched).to.equal(2); // Only check final accumulated value
          debug('accumulate over time: verify finished');
          done();
        }
      };

      // Sink post spy handler
      postspy = (reqs, cb) => {
        debug('accumulate over time: verify -> Posted new accumulated usage %o',
          reqs);

        map(reqs, (req) => {

          // Expect accumulated usage to be posted to the aggregator service
          expect(req[0])
            .to.equal('http://localhost:9300/v1/metering/accumulated/usage');

          // Expect accumulated values
          const val = req[1];
          try {
            debug('accumulate over time: verify -> ' +
              'verify accumulated usage[1] %o',
              val.body.accumulated_usage[1]);
            expect(expected).to.deep.include(val.body.accumulated_usage[1]);

            debug('accumulate over time: verify -> ' +
              'verify accumulated usage[3] %o',
              val.body.accumulated_usage[3]);
            expect(expected).to.deep.include(val.body.accumulated_usage[3]);

            debug('accumulate over time: verify -> ' +
              'verified accumulated usage');
            matched++;
          }
          catch(e) {
            unmatched++;
            debug('accumulate over time: verify -> ' +
              'unable to verify accumulated usage %o', e);
          }

          check();
        });
        cb(undefined, [[undefined, { statusCode: 201 }]]);
      };

      // Post usage one by one
      transform.reduce(usage, (a, u, i, l, cb) => {
        debug('accumulate over time: verify -> starting usage post ...');

        const uval = extend({}, u, {
          resource_instance_id: ['0b39fa70-a65f-4183-bae8-385633ca5c87',
            secured ? 1 : 0].join('-')
        });

        debug('accumulate over time: verify -> posting %o', uval);
        request.post('http://localhost::p/v1/metering/metered/usage', {
          p: server.address().port,
          body: uval
        }, (err, val) => {
          debug('accumulate over time: verify -> post response error %o, ' +
            'response %o', err, val);
          expect(err).to.equal(undefined);

          // Check oauth validator and authorize spy
          expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
          expect(authorizespy.args[0][0]).to.equal(undefined);
          expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
            system: ['abacus.usage.write']
          } : undefined);

          // Reset the OAuth spies before moving onto the next
          const done = () => {
            validatorspy.reset();
            authorizespy.reset();
            cb();
          };

          // Expect a 201 with the location of the accumulated usage
          if(i !== 2) {
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Get metered usage back, expecting what we posted
            debug('accumulate over time: verify -> get metered usage from %s',
              val.headers.location);
            brequest.get(val.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              // Check oauth validator and authorize spy
              expect(validatorspy.callCount).to.equal(secured ? 3 : 0);
              expect(authorizespy.args[1][0]).to.equal(undefined);
              expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
                system: ['abacus.usage.read']
              } : undefined);

              expect(omit(
                val.body, 'id', 'processed', 'processed_id'))
                .to.deep.equal(uval);
              debug('accumulate over time: verify finished');
              done();
            });
          }
          else {
            // Expect a 409 reporting duplicate usage
            expect(val.statusCode).to.equal(409);
            debug('accumulate over time: verify duplicate detection finished');
            done();
          }

        });
      }, undefined, check);
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
  
  it('performs time-based accumulation across a window boundary', (done) => {
    debug('window boundary: starting test ...');
    let records = 0;
    // Set the clock to 2015-10-31:02:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 9, 31, 2), 'Date');

    // Set up usage for the time-based metric
    // Start at October 30 - 17:00 until Nov 1 - 14:00
    // Running summary for October should gives 23 * 2 = 46
    // Summary for November should gives 24
    const usage = [
      // end at October 31 00:00 UTC
      usageTemplate(20, 1446249600000, 1446249600000, 'basic',
        'test-metering-plan', 'test-rating-plan',
        'test-pricing-basic', 0, 0, 0, 2, 0),
      // end at November 1 00:00 UTC
      usageTemplate(21, 1446336000000, 1446336000000, 'basic',
        'test-metering-plan', 'test-rating-plan',
        'test-pricing-basic', 0, 0, 0, 2, 0),
      // end at November 1 21:00
      usageTemplate(22, 1446415200000, 1446415200000, 'basic',
        'test-metering-plan', 'test-rating-plan',
        'test-pricing-basic', 0, 0, 0, 1, -2)
    ];
    usage[0].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2,
        previous_consuming: 0, since: 1446249600000 } }];
    usage[1].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2,
        previous_consuming: 0, since: 1446336000000 } }];
    usage[2].metered_usage = [
      { metric: 'memory', quantity: { consuming: 1,
        previous_consuming: -2, since: 1446415200000 } }];

    // Check the final expected value after everything is posted
    const currDay = {
      quantity: {
        previous: { consumed: 172800000, consuming: 2, since: 1446336000000 },
        current: { consumed: 244800000, consuming: 1, since: 1446415200000 }
      },
      cost: { consumed: 244800000, consuming: 1, price: 0.00014 }
    };
    const prevDay = {
      quantity: {
        current: { consumed: 172800000, consuming: 2, since: 1446249600000 }
      },
      cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
    };
    const currMonth = {
      quantity: {
        previous: { consumed: 5184000000, consuming: 2, since: 1446336000000 },
        current: { consumed: 2750400000, consuming: 1, since: 1446415200000 }
      },
      cost: { consumed: 2750400000, consuming: 1, price: 0.00014 }
    };
    const prevMonth = {
      quantity: {
        current: { consumed: -5011200000, consuming: 2, since: 1446249600000 }
      },
      cost: { consumed: -5011200000, consuming: 2, price: 0.00014 }
    };
    const expected = [[null], [null], [null], [currDay, prevDay, null],
      [currMonth, prevMonth]];

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    debug('window boundary: accumulator started on port %d',
      server.address().port);

    const postNov = () => {
      // Set the clock to 2015-11-01:23:00:00
      clock.restore();
      clock = sinon.useFakeTimers(Date.UTC(2015, 10, 1, 23), 'Date');
      debug('window boundary: clock set to 2015-11-01:23:00:00');

      request.post('http://localhost::p/v1/metering/metered/usage', {
        p: server.address().port,
        body: usage[1]
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        request.post('http://localhost::p/v1/metering/metered/usage', {
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
      debug('window boundary: POST request %d %o', records, reqs);
      // Post the November usage after the October usage is processed
      if(records === 1)
        postNov();
      // Only after all the records are received do we do the validation
      if(records === 3) {
        map(reqs, (req) => {
          debug('window boundary: verifying accumulated usage %o', req);
          expect(req[1].body.accumulated_usage[0].windows)
            .to.deep.equal(expected);
        });
        debug('window boundary: finished successfully');
        done();
      }
      // Signal to change the clock to november
      cb(undefined, [[undefined, { statusCode: 201 }]]);
    };

    // Post the initial October usage
    debug('window boundary: starting usage POST requests ...');
    request.post('http://localhost::p/v1/metering/metered/usage', {
      p: server.address().port,
      body: usage[0]
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
    });
  });

  it('usage older than the slack is rejected', (done) => {
    debug('slack rejection: starting test ...');
    let records = 0;
    // Set the clock to 2016-1-25:02:00:00
    clock = sinon.useFakeTimers(Date.UTC(2016, 0, 25, 2), 'Date');

    // Set up usage for the time-based metric
    const usage = [
      // Would be rejected
      usageTemplate(35, 1451952000000, 1451952000000, 'basic',
      'test-metering-plan', 'test-rating-plan',
      'test-pricing-basic', 0, 0, 0, 2, 0),
      usageTemplate(36, 1453593600000, 1453593600000, 'basic',
      'test-metering-plan', 'test-rating-plan',
      'test-pricing-basic', 0, 0, 0, 2, 0),
      usageTemplate(37, 1453680000000, 1453680000000, 'basic',
      'test-metering-plan', 'test-rating-plan',
      'test-pricing-basic', 0, 0, 0, 2, -2)
    ];
    // 0 is rejected.
    // 1 - 24 hours of consuming 2 = 48.
    // 1 gb running after. 168 untill the end of month.
    // total for this month = 48 + 168 = 216.
    usage[0].metered_usage = [
      { metric: 'memory', quantity: { consuming: 3,
        previous_consuming: 0, since: 1451952000000 } }];
    usage[1].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2,
        previous_consuming: 0, since: 1453593600000 } }];
    usage[2].metered_usage = [
      { metric: 'memory', quantity: { consuming: 1,
        previous_consuming: -2, since: 1453680000000 } }];

    const first = [null,
      {
        quantity: {
          current: { consumed: 172800000, consuming: 2, since: 1453593600000 }
        },
        cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
      },
      null
    ];
    const last = [null, null, null, null,
      {
        quantity: {
          current: { consumed: -86400000, consuming: 1, since: 1453680000000 }
        },
        cost: { consumed: -86400000, consuming: 1, price: 0.00014 }
      }
    ];

    postspy = (reqs, cb) => {
      records++;
      if(records === 1)
        expect(reqs[0][1].body.accumulated_usage[0].windows[3])
          .to.deep.equal(first);
      if(records === 2) {
        expect(reqs[0][1].body.accumulated_usage[0].windows[3])
          .to.deep.equal(last);
        done();
      }
      cb(undefined, [[undefined, { statusCode: 201 }]]);
    };

    // Post the usage
    const post = (usage, slack, scode, done) => {
      debug('slack rejection: usage POST requests ...');

      if(slack)
        process.env.SLACK = slack;

      // Create a test accumulator app
      const app = accumulator();

      // Listen on an ephemeral port
      const server = app.listen(0);
    
      debug('slack rejection: accumulator started on port %d',
        server.address().port);

      request.post('http://localhost::p/v1/metering/metered/usage', {
        p: server.address().port,
        body: usage
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(scode);
        if(done)
          done();
      });
    };
    post(usage[0], null, 409, () => post(usage[1], null, 201,
      () => {
        clock = sinon.useFakeTimers(Date.UTC(2016, 0, 29, 2), 'Date');
        post(usage[2], '5D', 201);
      }));
  });

  xit('attaches error and reason when there is a business error', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 5), 'Date');
    // Returns 2015-01-03 with the given hour for testing
    const time = (h) => Date.UTC(2015, 0, 3, h);

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 2) done();
    };

    const usage = {
      normalized_usage_id: '220',
      collected_usage_id: '666',
      resource_id: 'test-error',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: time(0),
      end: time(0),
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
        metrics: [{
          name: 'storage',
          price: 1
        }]
      },
      measured_usage: [{
        measure: 'storage',
        quantity: 1073741824
      }],
      metered_usage: [{
        metric: 'storage',
        quantity: 1
      }]
    };

    getspy = (reqs, cb) => {
      // Expect a call to the provisioning service's get metering plan
      expect(reqs[0][0]).to.equal(
        'http://localhost:9880/v1/metering/plans/:metering_plan_id');
      expect(reqs[0][1]).to.deep.equal({
        metering_plan_id: 'invalidMeteringPlan'
      });
      cb(undefined, [[undefined, {
        statusCode: 404
      }]]);

      check();
    };

    request.post('http://localhost::p/v1/metering/metered/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
      expect(val.body).to.deep.equal({
        error: 'emplannotfound',
        reason: 'Metering plan for the metering plan id invalidMeteringPlan' +
          ' is not found'
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

  it('takes error and reason from the sink and returns it', (done) => {
    process.env.SECURED = false;

    // Set the clock to 2015-01-03:05:00:00
    clock = sinon.useFakeTimers(Date.UTC(2016, 0, 29, 2), 'Date');
    // Returns 2015-01-03 with the given hour for testing
    const time = (h) => Date.UTC(2016, 0, 29, h);

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Handle callback checks
    let checks = 0;
    const check = () => {
      if(++checks == 2) done();
    };

    const usage = {
      normalized_usage_id: '220',
      collected_usage_id: '666',
      resource_id: 'test-error',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-errorc875',
      start: time(0),
      end: time(0),
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
          name: 'storage',
          price: 1
        }]
      },
      measured_usage: [{
        measure: 'storage',
        quantity: 1073741824
      }],
      metered_usage: [{
        metric: 'storage',
        quantity: 1
      }]
    };

    postspy = (reqs, cb) => {
      expect(reqs[0][0]).to.equal(
        'http://localhost:9300/v1/metering/accumulated/usage');
      expect(omit(reqs[0][1].body, 'id', 'processed', 'processed_id',
        'accumulated_usage', 'metered_usage_id')).to.deep.equal(omit(usage,
        'measured_usage', 'metered_usage'));

      // Simulates business error in abacus-aggregator
      cb(undefined, [[undefined, {
        statusCode: 201,
        body: {
          error: 'emplannotfound',
          reason: 'Metering plan for the metering plan id ' +
            'test-metering-plan is not found'
        }
      }]]);

      check();
    };

    request.post('http://localhost::p/v1/metering/metered/usage', {
      p: server.address().port,
      body: usage
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
      expect(val.body).to.deep.equal({
        error: 'esink',
        reason: [{
          error: 'emplannotfound',
          reason: 'Metering plan for the metering plan id test-metering-plan' +
          ' is not found'
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
});
