'use strict';

const cp = require('child_process');
const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const yieldable = require('abacus-yieldable');
const dbclient = require('abacus-dbclient');
const seqid = require('abacus-seqid');
const request = require('abacus-request');
const router = require('abacus-router');
const express = require('abacus-express');
const clone = require('abacus-clone');

const map = _.map;
const range = _.range;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-aggregator-itest');

const db = require('abacus-dataflow').db('abacus-aggregator-aggregated-usage');
db.allDocs = yieldable.functioncb(db.allDocs);

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-aggregator-itest');
commander
  .option('-o, --orgs <n>', 'number of organizations', parseInt)
  .option('-i, --instances <n>', 'number of resource instances', parseInt)
  .option('-u, --usagedocs <n>', 'number of usage docs', parseInt)
  .option('-d, --day <d>',
    'usage time shift using number of days', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// Number of organizations
const orgs = commander.orgs || 1;

// Number of resource instances
const resourceInstances = commander.instances || 1;

// Number of usage docs
const usage = commander.usagedocs || 1;

// Usage time shift by number of days in milli-seconds
const tshift = commander.day * 24 * 60 * 60 * 1000 || 0;

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

// Prunes the quantity of all the other windows except the monthly one
const pruneQuantity = (v, k) => {
  if(k === 'quantity')
    return v[4];
  return v;
};

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * 100000000
    + d.getUTCDate() * 1000000 + d.getUTCHours() * 10000 + d.getUTCMinutes()
    * 100 + d.getUTCSeconds();
};

// Converts a number output in dateUTCNumbify back to a Date object
const revertUTCNumber = (n) => {
  const numstring = n.toString();
  const d = new Date(Date.UTC(
    numstring.substring(0, 4),
    numstring.substring(4, 6),
    numstring.substring(6, 8),
    numstring.substring(8, 10),
    numstring.substring(10, 12),
    numstring.substring(12)
  ));
  return d;
};

// Calculates the accumulated quantity given an end time, u, window size,
// and multiplier factor of the usage
const calculateQuantityByWindow = (e, u, w, m, f) => {
  const time = e + u;
  const timeNum = dateUTCNumbify(time);
  const windowTimeNum = Math.floor(timeNum / w) * w;

  // Get the millisecond equivalent of the very start of the given window
  const windowTime = revertUTCNumber(windowTimeNum).getTime();
  return f(m, Math.min(time - windowTime, u));
};

// Scaling factor for a time window
// [Second, Minute, Hour, Day, Month]
const timescale = [1, 100, 10000, 1000000, 100000000];

// Builds the quantity array in the accumulated usage
const buildAccumulatedQuantity = (e, u, m, f) => {
  const quantity = map(timescale, (ts) => {
    // If this is the first usage, only return current
    if(u === 0)
      return [{ current: f(m, u + 1) }];
    // Return a properly accumulated current & previous
    return [{
      previous: calculateQuantityByWindow(e, u, ts, m, f),
      current: calculateQuantityByWindow(e, u + 1, ts, m, f)
    }];
  });
  return quantity;
};

// Builds the quantity array in the aggregated usage
const buildAggregatedQuantity = (p, u, ri, tri, count, end, f) => {
  const quantity = map(timescale, (ts) => {
    const time = end + u;
    const timeNum = dateUTCNumbify(time);
    const windowTimeNum = Math.floor(timeNum / ts) * ts;

    // Get the millisecond equivalent of the very start of the given window
    const windowTime = revertUTCNumber(windowTimeNum).getTime();
    return [f(p, Math.min(time - windowTime, u), ri, tri, count)];
  });
  return quantity;
};

describe('abacus-usage-aggregator-itest', () => {
  before(() => {
    const start = (module) => {
      const c = cp.spawn('npm', ['run', 'start'],
        { cwd: moduleDir(module), env: clone(process.env) });

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug('Application exited with code %d', c));
    };

    // Start local database server
    start('abacus-dbserver');

    // Start usage aggregator
    start('abacus-usage-aggregator');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage aggregator
    stop('abacus-usage-aggregator');

    // Stop local database server
    stop('abacus-dbserver');
  });

  it('aggregator accumulated usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 60 secs
    const timeout = Math.max(60000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);
    const giveup = Date.now() + timeout;

    // Setup rate spy
    const rate = spy((req, res, next) => {
      res.status(201).send();
    });

    // Start usage rate stub with the rate spy
    const app = express();
    const routes = router();
    routes.post('/v1/rating/aggregated/usage', rate);
    app.use(routes);
    app.use(router.batch(routes));
    app.listen(9400);

    // Initialize usage doc properties with unique values
    const start = 1435629365220 + tshift;
    const end = 1435629465220 + tshift;

    // Produce usage for two spaces in an organization, two consumers
    // in a space and create resource instances using two resource plans
    // at each space.

    // Usage template index values for a given org
    //  Usage  ResourceInstance  Space Plan Consumer(with space)
    //    0           0            0    0        0-0
    //    0           1            1    0        1-0
    //    0           2            0    1        0-0
    //    0           3            1    1        1-0
    //    0           4            0    0        0-1
    //    0           5            1    0        1-1
    //    0           6            0    1        0-1
    //    0           7            1    1        1-1
    //    0           8            0    0        0-0
    //    0           9            1    0        1-0
    //    0          10            0    1        0-0
    //    1           0            0    0        0-0
    //    1           1            1    0        1-0

    // Organization id based on org index
    const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      o + 1].join('-');

    // One of the two spaces at a given org based on resource instance index
    const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      o + 1, ri % 2 === 0 ? 1 : 2].join('-');

    // One of the two consumers at a given org and derived space based on
    // resource instance index
    const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bab',
      o + 1, ri % 2 === 0 ? 1 : 2, ri % 8 < 4 ? 1 : 2].join('-');

    // One of the two plans based on resource instance index
    const pid = (ri) => ri % 4 < 2 ? 'basic' : 'standard';

    // Resource instance id based on org and resouce instance indices
    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');

    // Usage and usage batch ids
    const uid = (o, ri, u) => [start, o + 1, ri + 1, u + 1].join('-');
    const bid = (u) => [start, u + 1].join('-');

    // Accumulated usage for given org, resource instance and usage #s
    const accumulatedTemplate = (o, ri, u) => ({
      id: uid(o, ri, u),
      collected_usage_id: bid(o, ri, u),
      start: start + u,
      end: end + u,
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      resource_instance_id: riid(o, ri),
      plan_id: pid(ri, u),
      consumer_id: cid(o, ri),
      accumulated_usage: [
        {
          metric: 'storage',
          quantity: buildAccumulatedQuantity(end, u, 1, (m, u) => m)
        },
        {
          metric: 'thousand_light_api_calls',
          quantity: buildAccumulatedQuantity(end, u, 1, (m, u) => m * u)
        },
        {
          metric: 'heavy_api_calls',
          quantity: buildAccumulatedQuantity(end, u, 100, (m, u) => m * u)
        }
      ]
    });

    // Use number sequences to find expected aggregated value at any given
    // resource instance index and a given usage index based on the generated
    // accumulated usage.

    // Total resource instances index
    const tri = resourceInstances - 1;

    // Create an array of objects based on a range and a creator function
    const create = (number, creator) =>
      map(range(number()), (i) => creator(i));

    // Aggregate metrics based on ressource instance, usage and plan indices
    // For max, we use either the current count or the totat count based on
    // resource instance index
    // For sum, we use current count + total count based on resource instance
    // and usage index
    const a = (ri, u, p, count) => [
      { metric: 'storage',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => u === 0 ? count(ri, p) : count(tri, p)) },
      { metric: 'thousand_light_api_calls',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => count(ri, p) + u * count(tri, p)) },
      { metric: 'heavy_api_calls',
        quantity: buildAggregatedQuantity(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => 100 * (count(ri, p) + u * count(tri, p))) }
    ];

    // Resource plan level aggregations for a given consumer at given space
    const scpagg = (o, ri, u, s, c) => {
      // Resource instance index shift to locate a value at count number
      // sequence specified below
      const shift = (p) =>
        (s === 0 ? c === 0 ? 8 : 4 : c === 0 ? 7 : 3) - (p === 0 ? 0 : 2);

      // Number sequence representing count for a given space, consumer and
      // plan based on specified spread using id generators
      // 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
      // 2, 2, 2, 2, 2, 2, 2, 2, 3, ......
      const count = (n, p) => Math.round((n + shift(p)) / 8 - 0.50);

      // Number of plans at a given space, consumer and
      // resource instance indices
      const plans = () => u === 0 && ri <= (c === 0 ? 1 + s : 5 + s) ||
        tri <= (c === 0 ? 1 + s : 5 + s) ? 1 : 2;

      // Create plan aggregations
      return create(plans, (i) => ({
        plan_id: pid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count)
      }));
    };

    // Consumer level resource aggregations for a given space
    const scagg = (o, ri, u, s) => {
      // Resource instance index shift
      const shift = (c) => (s === 0 ? 6 : 5) - (c === 0 ? 0 : 4);

      // Number sequence of count
      // 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4,
      // 5, 5, 6, .....
      const count = (n, c) => {
        const nri = n + shift(c);
        return 2 * Math.round(nri / 8 - 0.50) + (nri % 8 < 6 ? 0 : 1);
      };

      // Number of consumers at a given resource instance and space indices
      const consumers = () => u === 0 && ri <= 3 + s || tri <= 3 + s ? 1 : 2;

      // Create resource aggregations
      return create(consumers, (i) => ({
        consumer_id: cid(o, i === 0 ? s : s === 0 ? 4 : 5),
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: a(ri, u, i, count),
          plans: scpagg(o, ri, u, s, i)
        }]
      }));
    };

    // Resource plan level aggregations for a given space
    const spagg = (o, ri, u, s) => {
      // resource instance index shift
      const shift = (p) => (s === 0 ? 3 : 2) - (p === 0 ? 0 : 2);

      // Number sequence of count
      // 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, ......
      const count = (n, p) => Math.round((n + shift(p)) / 4 - 0.25);

      // Number of plans at a given resource instance and space indices
      const plans = () => u === 0 && ri <= 1 + s || tri <= 1 + s ? 1 : 2;

      // Create plan level aggregations
      return create(plans, (i) => ({
        plan_id: pid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count)
      }));
    };

    // Space level resource aggregations for a given organization
    const osagg = (o, ri, u) => {
      // Resource instance index shift
      const shift = (s) => s === 0 ? 1 : 0;

      // Number sequnce of count
      // 0, 1, 1, 2, 2, 3, 3, 4, 4,.....
      const count = (n, s) => Math.round((n + shift(s)) / 2);

      // Number of spaces at a given resource index
      const spaces = () => u === 0 && ri === 0 || tri === 0 ? 1 : 2;

      // Create resource instance aggregations
      return create(spaces, (i) => ({
        space_id: sid(o, i),
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: a(ri, u, i, count),
          plans: spagg(o, ri, u, i)
        }],
        consumers: scagg(o, ri, u, i)
      }));
    };

    // Resource plan level aggregations for a given organization
    const opagg = (o, ri, u) => {
      // Resource instance index shift
      const shift = (p) => p === 0 ? 2 : 0;

      // Number sequence of count
      // 0, 0, 1, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 6, 7, 8, 8, 8, ...........
      const count = (n, p) => {
        const nri = n + shift(p);

        return Math.round(nri / 2 +
          (nri % 2 === 0 ? 0 : 0.5) * ((nri / 2 - 0.5) % 2 === 0 ? -1 : 1));
      };

      // Number of plans at a given resource instance index
      const plans = () => u === 0 && ri <= 1 || tri <= 1 ? 1 : 2;

      // Create plan aggregations
      return create(plans, (i) => ({
        plan_id: pid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count)
      }));
    };

    // Aggregated usage for a given org, resource instance, usage indices
    // TODO check the values of the accumulated usage
    const aggregatedTemplate = (o, ri, u) => ({
      organization_id: oid(o),
      start: end + u,
      end: end + u,
      resources: [{
        resource_id: 'test-resource',
        aggregated_usage: a(ri, u, undefined, (n) => n + 1),
        plans: opagg(o, ri, u)
      }],
      spaces: osagg(o, ri, u)
    });

    const expected = clone(aggregatedTemplate(
      orgs - 1, resourceInstances - 1, usage - 1), pruneQuantity);

    // Post an accumulated usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit accumulated usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.post('http://localhost::p/v1/metering/accumulated/usage',
        { p: 9300, body: accumulatedTemplate(o, ri, u) }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Accumulated usage for org%d instance%d' +
            ' usage%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify accumulated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed'))
              .to.deep.equal(omit(
                accumulatedTemplate(o, ri, u), 'id', 'processed'));

            debug('Verified accumulated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            cb();
          });
        });
    });

    // Post the requested number of accumulated usage docs
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if(++posts === orgs * resourceInstances * usage) done();
      };

      // Submit usage for all orgs and resource instances
      map(range(usage), (u) => map(range(resourceInstances),
        (ri) => map(range(orgs), (o) => post(o, ri, u, cb))));
    };

    const verifyRating = (done) => {
      const startDate = Date.UTC(new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1) - 1;
      const endDate = Date.UTC(new Date().getUTCFullYear(),
        new Date().getUTCMonth(), 1);
      const sid = dbclient.kturi(expected.organization_id,
        seqid.pad16(startDate));
      const eid = dbclient.kturi(expected.organization_id,
        seqid.pad16(endDate));
      debug('comparing latest record within %s and %s', sid, eid);
      db.allDocs({ limit: 1, startkey: sid, endkey: eid, descending: true,
        include_docs: true },
        (err, val) => {
          try {
            expect(clone(omit(val.rows[0].doc, ['id', 'processed',
              '_id', '_rev', 'accumulated_usage_id', 'start']),
                pruneQuantity)).to.deep.equal(omit(expected, ['start']));
            done();
          }
          catch (e) {
            // If the test cannot verify the actual data with the expected
            // data within the giveup time, forward the exception
            if(Date.now() >= giveup) {
              debug('Unable to properly verify the last record');
              expect(clone(omit(val.rows[0].doc, ['id', 'processed',
                '_id', '_rev', 'accumulated_usage_id', 'start']),
                  pruneQuantity)).to.deep.equal(omit(expected, ['start']));
            }
            else
              // Try the expected test again
              setTimeout(function() {
                verifyRating(done);
              }, 250);
          }
        });
    };

    // Wait for usage aggregator to start
    request.waitFor('http://localhost::p/batch',
      { p: 9300 }, (err, value) => {
        // Failed to ping usage aggregator before timing out
        if (err) throw err;

        // Submit accumulated usage and verify
        submit(() => verifyRating(() => done()));
      });
  });
});
