'use strict';

const { extend, omit, range, map } = require('underscore');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const yieldable = require('abacus-yieldable');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');
const seqid = require('abacus-seqid');
const router = require('abacus-router');
const express = require('abacus-express');
const clone = require('abacus-clone');
const timewindow = require('abacus-timewindow');
const moment = require('abacus-moment');
const { checkCorrectSetup } = require('abacus-test-helper');

const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const lifecycleManager = require('abacus-lifecycle-manager')();

// Batch the requests
const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-accumulator-integration-test');

const db = require('abacus-dataflow').db('abacus-accumulator-accumulated-usage');
db.allDocs = yieldable.functioncb(db.allDocs);

const env = {
  db: process.env.DB_URI,
  orgs: process.env.ORGS || 1,
  resourceInstances: process.env.INSTANCES || 1,
  usage: process.env.USAGE_DOCS || 1,
  tshift: process.env.DAY * 24 * 60 * 60 * 1000 || 0,
  startTimeout: process.env.START_TIMEOUT || 30000,
  totalTimeout: process.env.TOTAL_TIMEOUT || 60000
};

const pruneWindows = (v, k) => {
  if (k === 'windows') return [v[4][0]];
  return v;
};

// Calculates the accumulated quantity given an end time, u, window size,
// and multiplier factor of the usage
const calculateQuantityByWindow = (e, u, w, m, f) => {
  const time = moment.utc(e + u);
  // Get the millisecond equivalent of the very start of the given window
  return f(m, Math.min(time.valueOf() - timewindow.zeroLowerTimeDimensions(time.toDate(), w).getTime(), u));
};

// Builds the quantity array in the accumulated usage
const buildQuantityWindows = (e, u, m, f) => {
  // Scaling factor for a time window
  // [Second, Minute, Hour, Day, Month]
  const dimensions = ['s', 'm', 'h', 'D', 'M'];
  return map(dimensions, (d) => {
    // If this is the first usage, only return current
    if (u === 0) return [{ quantity: { current: f(m, u + 1) } }];
    // Return a properly accumulated current & previous
    return [
      {
        quantity: {
          previous: calculateQuantityByWindow(e, u, d, m, f),
          current: calculateQuantityByWindow(e, u + 1, d, m, f)
        }
      }
    ];
  });
};

describe('accumulator integration test', () => {
  before(() => {
    checkCorrectSetup(env);
    const modules = [lifecycleManager.modules.accumulator, lifecycleManager.modules.accountPlugin];

    dbclient.drop(env.db, /^abacus-/, () => {
      lifecycleManager.startModules(modules);
    });
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  it('accumulate metered usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or
    // a predefined timeout
    const timeout = Math.max(env.totalTimeout, 100 * env.orgs * env.resourceInstances * env.usage);
    this.timeout(timeout + 2000);

    // Setup aggregator spy
    const aggregator = spy((req, res, next) => {
      res.status(201).send();
    });

    // Start usage aggregator stub with the aggregator spy
    const app = express();
    const routes = router();
    routes.post('/v1/metering/accumulated/usage', aggregator);
    app.use(routes);
    app.use(router.batch(routes));
    app.listen(9300);

    // Initialize usage doc properties with unique values
    const start = moment.now() + env.tshift;
    const end = moment.now() + env.tshift;

    const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', o + 1].join('-');
    const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6a', o + 1].join('-');
    const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bab', o + 1].join('-');
    const pid = () => 'basic';
    const ppid = () => 'test-pricing-basic';
    const rpid = () => 'test-rating-plan';
    const mpid = () => 'test-metering-plan';

    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87', o + 1, ri + 1].join('-');

    const uid = (o, ri, u) => [start, o + 1, ri + 1, u + 1].join('-');
    const bid = (u) => [u + 1].join('-');

    // Return a usage with unique start and end time based on a number
    const meteredTemplate = (o, ri, u) => ({
      id: uid(o, ri, u),
      collected_usage_id: bid(o, ri, u),
      start: start + u,
      end: start + u,
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      resource_instance_id: riid(o, ri),
      plan_id: pid(),
      consumer_id: cid(o, ri),
      resource_type: 'test-resource',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: mpid(),
      rating_plan_id: rpid(),
      pricing_plan_id: ppid(),
      prices: {
        metrics: [
          {
            name: 'storage',
            price: pid() === 'basic' ? 1 : 0.5
          },
          {
            name: 'thousand_light_api_calls',
            price: pid() === 'basic' ? 0.03 : 0.04
          },
          {
            name: 'heavy_api_calls',
            price: pid() === 'basic' ? 0.15 : 0.18
          },
          {
            name: 'memory',
            price: pid() === 'basic' ? 0.00014 : 0.00028
          }
        ]
      },
      metered_usage: [
        { metric: 'storage', quantity: 1 },
        { metric: 'thousand_light_api_calls', quantity: 1 },
        { metric: 'heavy_api_calls', quantity: 100 }
      ]
    });

    // Accumulated usage for given org, resource instance and usage #s
    // TODO check the values of the accumulated usage
    const accumulatedTemplate = (o, ri, u) =>
      extend(omit(meteredTemplate(o, ri, u), ['id', 'metered_usage', 'measured_usage']), {
        accumulated_usage: [
          {
            metric: 'storage',
            windows: buildQuantityWindows(end, u, 1, (m, u) => m)
          },
          {
            metric: 'thousand_light_api_calls',
            windows: buildQuantityWindows(end, u, 1, (m, u) => m * u)
          },
          {
            metric: 'heavy_api_calls',
            windows: buildQuantityWindows(end, u, 100, (m, u) => m * u)
          }
        ]
      });

    const expected = clone(accumulatedTemplate(env.orgs - 1, env.resourceInstances - 1, env.usage - 1), pruneWindows);

    // Post a metered usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit metered usage for org:%d instance:%d usage:%d', o + 1, ri + 1, u + 1);

      brequest.post(
        'http://localhost::p/v1/metering/metered/usage',
        { p: 9200, body: meteredTemplate(o, ri, u) },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Metered usage for org:%d instance:%d usage:%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify metered usage for org:%d instance:%d usage:%d', o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed', 'processed_id', 'metered_usage_id')).to.deep.equal(
              omit(meteredTemplate(o, ri, u), 'id', 'processed', 'processed_id')
            );

            debug('Verified metered usage for org:%d instance:%d usage:%d', o + 1, ri + 1, u + 1);

            cb();
          });
        }
      );
    });

    // Post the requested number of metered usage docs
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if (++posts === env.orgs * env.resourceInstances * env.usage) done();
      };

      // Submit usage for all env.orgs and resource instances
      map(range(env.usage), (u) => map(range(env.resourceInstances),
        (ri) => map(range(env.orgs), (o) => post(o, ri, u, cb))));
    };

    const verifyAggregator = (done) => {
      const startDate = moment
        .utc()
        .endOf('month')
        .valueOf();
      const endDate = moment
        .utc()
        .startOf('month')
        .valueOf();
      const sid = dbclient.kturi(
        [
          expected.organization_id,
          expected.resource_instance_id,
          expected.consumer_id,
          expected.plan_id,
          expected.metering_plan_id,
          expected.rating_plan_id,
          expected.pricing_plan_id
        ].join('/'),
        seqid.pad16(startDate)
      );
      const eid = dbclient.kturi(
        [
          expected.organization_id,
          expected.resource_instance_id,
          expected.consumer_id,
          expected.plan_id,
          expected.metering_plan_id,
          expected.rating_plan_id,
          expected.pricing_plan_id
        ].join('/'),
        seqid.pad16(endDate)
      );
      debug('Comparing latest record in [%s, %s]', sid, eid);
      db.allDocs(
        {
          limit: 1,
          startkey: sid,
          endkey: eid,
          descending: true,
          include_docs: true
        },
        (err, val) => {
          // Documents might arrive out-of-order in accumulator
          // We do not care for the order (start/end), therefore we remove it from actual & expected doc
          const actualDoc = clone(
            omit(val.rows[0].doc, [
              'processed', 'processed_id', '_rev', '_id', 'id', 'metered_usage_id', 'start', 'end'
            ]),
            pruneWindows
          );
          const expectedDoc = omit(expected, [ 'start', 'end' ]);

          expect(actualDoc).to.deep.equal(expectedDoc);
          done();
        }
      );
    };

    // Wait for usage accumulator to start
    request.waitFor('http://localhost::p/batch', { p: 9200 }, env.startTimeout, (err, value) => {
      // Failed to ping usage accumulator before timing out
      if (err) throw err;

      // Submit metered usage and verify
      submit(() => verifyAggregator(() => done()));
    });
  });
});
