'use strict';

// Usage accumulator service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-oauth');

const extend = _.extend;
const omit = _.omit;
const map = _.map;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-accumulator-test');

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and aggregator service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.AGGREGATOR = 'http://localhost:9300';

// Configure test slack window
process.env.SLACK = '2D';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, {
    single: spy()
  });

// Mock the request module
let postspy;
const reqmock = extend({}, request, {
  batch_get: spy((reqs, cb) => {
    return cb(undefined, [[undefined, {
      statusCode: 200,
      body: {
        pricing_country: 'USA'
      }
    }]]);
  }),
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
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const accumulator = require('..');


// Metered usage template
// Takes in usage#, start, end, plan id, storage, light api calls,
// heavy api calls quantity, and memory quantity
const usageTemplate = (u, s, e, p, st, lapi, hapi, mem) => ({
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
  metered_usage: [
    { metric: 'storage', quantity: st },
    { metric: 'thousand_light_api_calls', quantity: lapi },
    { metric: 'heavy_api_calls', quantity: hapi },
    { metric: 'memory', quantity: { consuming: mem, since: s } }
  ]
});

const usageTemplateV2 = (u, s, e, mp, rp, pi, st, lapi, hapi, mem) => ({
  normalized_usage_id: (330 + u).toString(),
  start: s,
  end: e,
  collected_usage_id: '555',
  resource_type: '1.0',
  plan_id: mp,
  metered_usage_id: (422 + u).toString(),
  resource_id: 'test-resource',
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  metering_plan_id: mp,
  rating_plan_id: rp,
  account_id: '1234',
  price_id: pi,
  metered_usage: [
    { metric: 'storage', quantity: st },
    { metric: 'thousand_light_api_calls', quantity: lapi },
    { metric: 'heavy_api_calls', quantity: hapi },
    { metric: 'memory', quantity: { consuming: mem, since: s } }
  ]
});

describe('abacus-usage-accumulator', () => {
  let clock;

  afterEach(() => {
    clock.restore();
  });

  it('accumulates usage over time', (done) => {
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
      usageTemplate(0, time(0), time(1), 'basic', 1, 0.03, 20, 6),
      usageTemplate(1, time(1), time(2), 'basic', 1, 0.03, 20, 6),
      usageTemplate(2, time(0), time(1), 'basic', 1, 0.01, 20, 6),
      usageTemplate(3, time(2), time(3), 'standard', 1, 0.01, 20, 4),
      usageTemplate(4, time(-22), time(-21), 'standard', 1, 0.01, 20, 4),
      extend(usageTemplate(5, time(2), time(3), 'standard', 1, 1, 200, 40), {
        consumer_id: 'external:cceae239-f3f8-483c-9dd0-de6781c38bcc'
      })
    ];

    // Possible expected accumulated values
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
            previous: { consumed: 0, consuming: 6, since: 1420243200000 },
            current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
          },
          cost: { burned: 3024, burning: 0.00084, since: 1420246800000 }
        }, null, null],
        [{
          quantity: {
            previous: { consumed: 0, consuming: 6, since: 1420243200000 },
            current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
          },
          cost: { burned: 3024, burning: 0.00084, since: 1420246800000 }
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
            current: { consumed: 0, consuming: 4, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.00112, since: 1420250400000 }
        }, {
          quantity: {
            current: { consumed: 0, consuming: 4, since: 1420164000000 }
          },
          cost: { burned: 0, burning: 0.00112, since: 1420164000000 }
        }, null],
        [{
          quantity: {
            previous: { consumed: 0, consuming: 4, since: 1420250400000 },
            current: { consumed: -345600000, consuming: 4,
              since: 1420164000000 }
          },
          cost: { burned: -96768, burning: 0.00112, since: 1420164000000 }
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
            current: { consumed: 0, consuming: 40, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.0112, since: 1420250400000 }
        }, null, null],
        [{
          quantity: {
            current: { consumed: 0, consuming: 40, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.0112, since: 1420250400000 }
        }, null]]
    }];

    // Verify secured or unsecured accumulator
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

      // Handle callback checks and at the end, verify the expectation
      // of sink payload
      let checks = 0, matched = 0, unmatched = 0;
      const check = () => {
        if(++checks == 6) {
          expect(matched).to.equal(3);
          expect(unmatched).to.equal(2);
          done();
        }
      };

      // Sink post spy handler
      postspy = (reqs, cb) => {
        debug('Posted new accumulated usage %o', reqs);

        map(reqs, (req) => {

          // Expect accumulated usage to be posted to the aggregator service
          expect(req[0])
            .to.equal('http://localhost:9300/v1/metering/accumulated/usage');

          // Expect accumulated values
          const val = req[1];
          try {
            debug('Verify accumulated usage[1] %o',
              val.body.accumulated_usage[1]);
            expect(expected).to.deep.include(val.body.accumulated_usage[1]);

            debug('Verify accumulated usage[3] %o',
              val.body.accumulated_usage[3]);
            expect(expected).to.deep.include(val.body.accumulated_usage[3]);

            debug('Verified accumulated usage');
            matched++;
          }
          catch(e) {
            unmatched++;
            debug('Unable to verify accumulated usage %o', e);
          }

          check();
        });
        cb(undefined, [[undefined, { statusCode: 200 }]]);
      };

      // Post usage one by one
      transform.reduce(usage, (a, u, i, l, cb) => {
        const uval = extend({}, u, {
          resource_instance_id: ['0b39fa70-a65f-4183-bae8-385633ca5c87',
            secured ? 1 : 0].join('-')
        });

        request.post('http://localhost::p/v1/metering/metered/usage', {
          p: server.address().port,
          body: uval
        }, (err, val) => {
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
                val.body, 'id', 'processed')).to.deep.equal(uval);
              done();
            });

          }
          else {
            // Expect a 409 reporting duplicate usage
            expect(val.statusCode).to.equal(409);
            done();
          }

        })
      }, undefined, check);
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('Test time-based accumulation across a window boundary', (done) => {
    let records = 0;
    // Set the clock to 2015-10-31:02:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 9, 31, 2), 'Date');

    // Set up usage for the time-based metric
    const usage = [
      usageTemplate(20, 1446249600000, 1446249600000, 'basic', 0, 0, 0, 2),
      usageTemplate(21, 1446336000000, 1446336000000, 'basic', 0, 0, 0, 2),
      usageTemplate(22, 1446415200000, 1446415200000, 'basic', 0, 0, 0, 1)
    ];
    usage[0].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2, since: 1446249600000 } }];
    usage[1].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2, since: 1446336000000 } }];
    usage[2].metered_usage = [
      { metric: 'memory', quantity: { consuming: 1, since: 1446415200000 } }];

    // Check the final expected value after everything is posted
    const curr = {
      quantity: {
        previous: { consumed: 0, consuming: 2, since: 1446336000000 },
        current: { consumed: 158400000, consuming: 1, since: 1446415200000 }
      },
      cost: { burned: 22176, burning: 0.00014, since: 1446415200000 }
    };
    const prev = {
      quantity: {
        current: { consumed: 0, consuming: 2, since: 1446249600000 }
      },
      cost: { burned: 0, burning: 0.00028, since: 1446249600000 }
    };
    const expected = [[null], [null], [null], [curr, prev, null], [curr, prev]];

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postNov = () => {
      // Set the clock to 2015-11-01:23:00:00
      clock.restore();
      clock = sinon.useFakeTimers(Date.UTC(2015, 10, 1, 23), 'Date');

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
      // Post the November usage after the October usage is processed
      if(records === 1)
        postNov();
      // Only after all the records are received do we do the validation
      if(records === 3) {
        map(reqs, (req) => {
          expect(req[1].body.accumulated_usage[0].windows)
            .to.deep.equal(expected);
        });
        done();
      }
      // Signal to change the clock to november
      cb(undefined, [[undefined, { statusCode: 200 }]]);
    };

    // Post the initial October usage
    request.post('http://localhost::p/v1/metering/metered/usage', {
      p: server.address().port,
      body: usage[0]
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
    });
  });
});

describe('abacus-usage-accumulator-v2', () => {
  let clock;

  afterEach(() => {
    clock.restore();
  });

  it('accumulates usage over time v2', (done) => {
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
    // usage 336 represent usage for a different rating plan, and it
    // should be accumulated separately
    // usage 337 represent usage for a different rating id, and it should be
    // accumulated separately
    const usage = [
      usageTemplateV2(0, time(0), time(1), 'basic', 'basic',
        'common', 1, 0.03, 20, 6),
      usageTemplateV2(1, time(1), time(2), 'basic', 'basic',
        'common', 1, 0.03, 20, 6),
      usageTemplateV2(2, time(0), time(1), 'basic', 'basic',
        'common', 1, 0.01, 20, 6),
      usageTemplateV2(3, time(2), time(3), 'standard', 'standard',
        'common', 1, 0.01, 20, 4),
      usageTemplateV2(4, time(-22), time(-21), 'standard', 'standard',
        'common', 1, 0.01, 20, 4),
      extend(usageTemplateV2(5, time(2), time(3), 'standard', 'standard',
        'common', 1, 1, 200, 40), {
          consumer_id: 'external:cceae239-f3f8-483c-9dd0-de6781c38bcc'
        }),
      usageTemplateV2(6, time(0), time(1), 'basic', 'standard',
        'common', 1, 0.05, 200, 40),
      usageTemplateV2(7, time(2), time(3), 'basic', 'standard',
        'discount', 1, 1, 200, 40)
    ];

    // Possible expected accumulated values
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
            previous: { consumed: 0, consuming: 6, since: 1420243200000 },
            current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
          },
          cost: { burned: 3024, burning: 0.00084, since: 1420246800000 }
        }, null, null],
        [{
          quantity: {
            previous: { consumed: 0, consuming: 6, since: 1420243200000 },
            current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
          },
          cost: { burned: 3024, burning: 0.00084, since: 1420246800000 }
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
            current: { consumed: 0, consuming: 4, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.00112, since: 1420250400000 }
        }, {
          quantity: {
            current: { consumed: 0, consuming: 4, since: 1420164000000 }
          },
          cost: { burned: 0, burning: 0.00112, since: 1420164000000 }
        }, null],
        [{
          quantity: {
            previous: { consumed: 0, consuming: 4, since: 1420250400000 },
            current: { consumed: -345600000, consuming: 4,
              since: 1420164000000 }
          },
          cost: { burned: -96768, burning: 0.00112, since: 1420164000000 }
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
            current: { consumed: 0, consuming: 40, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.0112, since: 1420250400000 }
        }, null, null],
        [{
          quantity: {
            current: { consumed: 0, consuming: 40, since: 1420250400000 }
          },
          cost: { burned: 0, burning: 0.0112, since: 1420250400000 }
        }, null]]
    }, {
      metric: 'thousand_light_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { current: 0.05 }, cost: 0.002 },
          null, null ],
        [{ quantity: { current: 0.05 }, cost: 0.002 },
          null]]
    }, {
      metric: 'thousand_light_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { current: 1 }, cost: 0.03 },
          null, null ],
        [{ quantity: { current: 1 }, cost: 0.03 },
          null]]
    }];

    // Verify secured or unsecured accumulator
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

      // Handle callback checks and at the end, verify the expectation
      // of sink payload
      let checks = 0, matched = 0, unmatched = 0;
      const check = () => {
        if(++checks == 8) {
          expect(matched).to.equal(5);
          expect(unmatched).to.equal(2);
          done();
        }
      };

      // Sink post spy handler
      postspy = (reqs, cb) => {
        debug('Posted new accumulated usage %o', reqs);

        map(reqs, (req) => {

          // Expect accumulated usage to be posted to the aggregator service
          expect(req[0])
            .to.equal('http://localhost:9300/v2/metering/accumulated/usage');

          // Expect accumulated values
          const val = req[1];
          try {
            debug('Verify accumulated usage[1] %o',
              val.body.accumulated_usage[1]);
            expect(expected).to.deep.include(val.body.accumulated_usage[1]);

            debug('Verify accumulated usage[3] %o',
              val.body.accumulated_usage[3]);

            debug('Verified accumulated usage');
            matched++;
          }
          catch(e) {
            unmatched++;
            debug('Unable to verify accumulated usage %o', e);
          }

          check();
        });
        cb(undefined, [[undefined, { statusCode: 200 }]]);
      };

      // Post usage one by one
      transform.reduce(usage, (a, u, i, l, cb) => {
        const uval = extend({}, u, {
          resource_instance_id: ['0b39fa70-a65f-4183-bae8-385633ca5c87',
            secured ? 1 : 0].join('-')
        });

        request.post('http://localhost::p/v2/metering/metered/usage', {
          p: server.address().port,
          body: uval
        }, (err, val) => {
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
                val.body, 'id', 'processed')).to.deep.equal(uval);
              done();
            });

          }
          else {
            // Expect a 409 reporting duplicate usage
            expect(val.statusCode).to.equal(409);
            done();
          }

        })
      }, undefined, check);
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  /*
  it('Test time-based accumulation across a window boundary v2', (done) => {
    let records = 0;
    // Set the clock to 2015-10-31:02:00:00
    clock = sinon.useFakeTimers(Date.UTC(2015, 9, 31, 2), 'Date');

    // Set up usage for the time-based metric
    const usage = [
      usageTemplateV2(20, 1446249600000, 1446249600000, 'basic', 'basic',
        'common', 0, 0, 0, 2),
      usageTemplateV2(21, 1446336000000, 1446336000000, 'basic', 'basic',
        'common', 0, 0, 0, 2),
      usageTemplateV2(22, 1446415200000, 1446415200000, 'basic', 'basic',
        'common', 0, 0, 0, 1)
    ];
    usage[0].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2, since: 1446249600000 } }];
    usage[1].metered_usage = [
      { metric: 'memory', quantity: { consuming: 2, since: 1446336000000 } }];
    usage[2].metered_usage = [
      { metric: 'memory', quantity: { consuming: 1, since: 1446415200000 } }];

    // Check the final expected value after everything is posted
    const curr = {
      quantity: {
        previous: { consumed: 0, consuming: 2, since: 1446336000000 },
        current: { consumed: 158400000, consuming: 1, since: 1446415200000 }
      },
      cost: { burned: 22176, burning: 0.00014, since: 1446415200000 }
    };
    const prev = {
      quantity: {
        current: { consumed: 0, consuming: 2, since: 1446249600000 }
      },
      cost: { burned: 0, burning: 0.00028, since: 1446249600000 }
    };
    const expected = [[null], [null], [null], [curr, prev, null], [curr, prev]];

    // Create a test accumulator app
    const app = accumulator();

    // Listen on an ephemeral port
    const server = app.listen(0);

    const postNov = () => {
      // Set the clock to 2015-11-01:23:00:00
      clock.restore();
      clock = sinon.useFakeTimers(Date.UTC(2015, 10, 1, 23), 'Date');

      request.post('http://localhost::p/v2/metering/metered/usage', {
        p: server.address().port,
        body: usage[1]
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);
        request.post('http://localhost::p/v2/metering/metered/usage', {
          p: server.address().port,
          body: usage[2]
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
        });
      });
    };

    postspy = (reqs, cb) => {
      console.log(JSON.stringify(reqs[0][1]))
      records++;
      // Post the November usage after the October usage is processed
      if(records === 1)
        postNov();
      // Only after all the records are received do we do the validation
      if(records === 3) {
        map(reqs, (req) => {
          expect(req[1].body.accumulated_usage[0].windows)
            .to.deep.equal(expected);
        });
        done();
      }
      // Signal to change the clock to november
      cb(undefined, [[undefined, { statusCode: 200 }]]);
    };

    // Post the initial October usage
    request.post('http://localhost::p/v2/metering/metered/usage', {
      p: server.address().port,
      body: usage[0]
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);
    });
  });
  */
});
