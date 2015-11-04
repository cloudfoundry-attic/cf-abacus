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

// Returns 2015-01-03 with the given hour for testing
const time = (h) => Date.UTC(2015, 0, 3, h);

describe('abacus-usage-accumulator', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.UTC(2015, 0, 3, 5), 'Date');
  });

  afterEach(() => {
    clock.restore();
  });

  it('accumulates usage over time', (done) => {
    // Metered usage template
    const usageTemplate = (u, h, p, st, lapi, hapi, mem) => ({
      normalized_usage_id: (330 + u).toString(),
      start: time(h),
      end: time(h + 1),
      collected_usage_id: '555',
      metered_usage_id: (422 + u).toString(),
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
      region: 'us',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      plan_id: p,
      metered_usage: [
        { metric: 'storage', quantity: st },
        { metric: 'thousand_light_api_calls', quantity: lapi },
        { metric: 'heavy_api_calls', quantity: hapi },
        { metric: 'memory', quantity: { consuming: mem, since: time(h) } }
      ]
    });

    // Define a sequence of usage for a resource instance:
    // usage 330 and 331 represent usage for two consecutive time periods,
    // then usage 332 comes as a duplicate of usage 330 and should be skipped,
    // usage 333 and 334 represent usage for two consecutive days for a
    // different plan than the first set,
    // usage 335 repsent usage for a different consumer, but otherwise same as
    // usage 333 and should not be skipped as duplicate and should be
    // accumulated separately
    const usage = [
      usageTemplate(0, 0, 'basic', 1, 0.03, 20, 6),
      usageTemplate(1, 1, 'basic', 1, 0.03, 20, 6),
      usageTemplate(2, 0, 'basic', 1, 0.01, 20, 6),
      usageTemplate(3, 2, 'standard', 1, 0.01, 20, 4),
      usageTemplate(4, -22, 'standard', 1, 0.01, 20, 4),
      extend(usageTemplate(5, 2, 'standard', 1, 1, 200, 40), {
        consumer_id: 'external:cceae239-f3f8-483c-9dd0-de6781c38bcc'
      })
    ];

    // Possible expected accumulated values
    const expected = [{
      metric: 'thousand_light_api_calls',
      quantity: [[0], [0], [0],
       [{ previous: 0.03, current: 0.06 }, 0, 0],
       [{ previous: 0.03, current: 0.06 }, 0]
      ]
    }, {
      metric: 'memory',
      quantity: [[0],[0],[0],
        [{ previous: { consumed: 0, consuming: 6, since: 1420243200000 },
           current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
        }, 0, 0],
        [{ previous: { consumed: 0, consuming: 6, since: 1420243200000 },
           current: { consumed: 21600000, consuming: 6, since: 1420246800000 }
        }, 0]
      ]
    }, {
      metric: 'thousand_light_api_calls',
      quantity: [[0], [0], [0],
        [{ current: 0.01 }, { current: 0.01 }, 0],
        [{ previous: 0.01, current: 0.02 }, 0]
      ]
    }, {
      metric: 'memory',
      quantity: [[0],[0],[0],
        [{ current: { consumed: 0, consuming: 4, since: 1420250400000 } },
         { current: { consumed: 0, consuming: 4, since: 1420164000000 } },
        0],
        [{ previous: { consumed: 0, consuming: 4, since: 1420250400000 },
           current: { consumed: -345600000, consuming: 4, since: 1420164000000 }
        }, 0]
      ]
    }, {
      metric: 'thousand_light_api_calls',
      quantity: [[0],[0],[0],
        [{ current: 1 }, 0, 0],
        [{ current: 1 }, 0]
      ]
    }, {
      metric: 'memory',
      quantity: [[0],[0],[0],
        [{ current: { consumed: 0, consuming: 40, since: 1420250400000 } },
        0, 0],
        [{ current: { consumed: 0, consuming: 40, since: 1420250400000 } },
        0]
      ]
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

        // Expect accumulated usage to be posted to the aggregator service
        expect(reqs[0][0])
          .to.equal('http://localhost:9300/v1/metering/accumulated/usage');

        // Expect accumulated values
        const val = reqs[0][1];
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
});
