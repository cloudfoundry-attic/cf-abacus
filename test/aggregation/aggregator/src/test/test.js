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
const clone = require('abacus-clone');
const timewindow = require('abacus-timewindow');

const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const map = _.map;
const range = _.range;
const extend = _.extend;
const omit = _.omit;
const filter = _.filter;
const pick = _.pick;

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
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
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

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 30000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

// Prunes all the windows of everything but the monthly quantity and cost
const pruneWindows = (v, k) => {
  if(k === 'windows') {
    const nwin = {};
    const sumWindowValue = (w1, w2, k) => {
      if(typeof w1[k] !== 'undefined')
        nwin[k] = w2 ? w1[k] + w2[k] : w1[k];
    };
    sumWindowValue(v[4][0], v[4][1], 'quantity');
    sumWindowValue(v[4][0], v[4][1], 'cost');
    return nwin;
  }
  if(k === 'consumers')
    return map(v, (c) => omit(c, 't'));
  if(k === 'resource_instances')
    return map(v, (ri) => omit(ri, 'processed'));
  return v;
};

// Calculates the accumulated quantity given an end time, u, window size,
// and multiplier factor of the usage
const calculateQuantityByWindow = (e, u, w, m, f) => {
  const time = new Date(e + u);

  // Get the millisecond equivalent of the very start of the given window
  return f(m, Math.min(time.getTime() -
    timewindow.zeroLowerTimeDimensions(time, w).getTime(), u));
};

// Dimensions for a time window
// [Second, Minute, Hour, Day, Month]
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// Builds the quantity array in the accumulated usage
const buildAccumulatedWindows = (e, u, m, f, price) => {
  const windows = map(dimensions, (d) => {
    // If this is the first usage, only return current
    if(u === 0)
      return [{ quantity: { current: f(m, u + 1) } }];
    // Return a properly accumulated current & previous
    return [{
      quantity: {
        previous: calculateQuantityByWindow(e, u, d, m, f),
        current: calculateQuantityByWindow(e, u + 1, d, m, f) } }];
  });
  return map(windows, (w) => map(w, (q) => extend(q, {
    cost: new BigNumber(q.quantity.current).mul(price).toNumber() })));
};

// Builds the quantity array in the aggregated usage
const buildAggregatedWindows = (p, u, ri, tri, count, end, f, price) => {
  return map(dimensions, (d) => {
    const time = new Date(end + u);
    const windowTime = timewindow.zeroLowerTimeDimensions(time, d);

    const q = f(p, Math.min(time.getTime() - windowTime.getTime(), u),
      ri, tri, count);
    return price === undefined ? [{ quantity: q }] :
      [{ quantity: q,
        cost: new BigNumber(q).mul(price).toNumber() }];
  });
};

describe('abacus-usage-aggregator-itest', () => {
  before((done) => {
    const start = (module) => {
      const c = cp.spawn('npm', ['run', 'start'],
        { cwd: moduleDir(module), env: clone(process.env) });

      // Add listeners to stdout, stderr and exit messsage and forward the
      // messages to debug logs
      c.stdout.on('data', (d) => process.stdout.write(d));
      c.stderr.on('data', (d) => process.stderr.write(d));
      c.on('exit', (c) => debug('Application exited with code %d', c));
    };

    const services = () => {
      // Start account plugin
      start('abacus-account-plugin');

      // Start usage aggregator
      start('abacus-usage-aggregator');

      done();
    };

    // Start local database server
    if (!process.env.DB) {
      start('abacus-pouchserver');
      services();
    }
    else
      // Delete test dbs on the configured db server
      dbclient.drop(process.env.DB, /^abacus-aggregator-/, () => {
        services();
      });
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage aggregator
    stop('abacus-usage-aggregator');

    // Stop account plugin
    stop('abacus-account-plugin');

    // Stop local database server
    if (!process.env.DB)
      stop('abacus-pouchserver');
  });

  it('aggregator accumulated usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or
    // predefined timeout
    const timeout = Math.max(totalTimeout,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);
    const processingDeadline = Date.now() + timeout;

    // Initialize usage doc properties with unique values
    const start = Date.now() + tshift;
    const end = Date.now() + tshift;

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

    // The metering plan id
    const mpid = (ri) => 'test-metering-plan';

    // One of the two rating plans based on resource instance index
    const ppid = (ri) => ri % 4 < 2 ? 'test-pricing-basic' :
      'test-pricing-standard';

    // One of the two pricing plans based on resource instance index
    const rpid = (ri) => ri % 4 < 2 ? 'test-rating-plan' :
      'test-rating-plan-standard';

    // Resource instance id based on org and resouce instance indices
    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');

    // Usage and usage batch ids
    const utime = Date.now();
    const uid = (o, ri, u) => dbclient.kturi(
      [start, o + 1, ri + 1, u + 1].join('-'), utime + u + 1);
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
      plan_id: pid(ri),
      consumer_id: cid(o, ri),
      resource_type: 'test-resource',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: mpid(ri),
      rating_plan_id: rpid(ri),
      pricing_plan_id: ppid(ri),
      prices: {
        metrics: [
          { name: 'storage',
            price: pid(ri) === 'basic' ? 1 : 0.5 },
          { name: 'thousand_light_api_calls',
            price: pid(ri) === 'basic' ? 0.03 : 0.04 },
          { name: 'heavy_api_calls',
            price: pid(ri) === 'basic' ? 0.15 : 0.18 },
          { name: 'memory',
            price: pid(ri) === 'basic' ? 0.00014 : 0.00028 }
        ]
      },
      accumulated_usage: [
        {
          metric: 'storage',
          windows: buildAccumulatedWindows(end, u, 1, (m, u) => m,
            pid(ri) === 'basic' ? 1 : 0.5)
        },
        {
          metric: 'thousand_light_api_calls',
          windows: buildAccumulatedWindows(end, u, 1, (m, u) => m * u,
            pid(ri) === 'basic' ? 0.03 : 0.04)
        },
        {
          metric: 'heavy_api_calls',
          windows: buildAccumulatedWindows(end, u, 100, (m, u) => m * u,
            pid(ri) === 'basic' ? 0.15 : 0.18)
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
    /* eslint complexity: [1, 6] */
    const a = (ri, u, p, count, addCost) => [
      { metric: 'storage',
        windows: buildAggregatedWindows(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => u === 0 ? count(ri, p) : count(tri, p),
          addCost ? p === 0 ? 1 : 0.5 : undefined) },
      { metric: 'thousand_light_api_calls',
        windows: buildAggregatedWindows(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => count(ri, p) + u * count(tri, p),
          addCost ? p === 0 ? 0.03 : 0.04 : undefined) },
      { metric: 'heavy_api_calls',
        windows: buildAggregatedWindows(p, u, ri, tri, count, end,
          (p, u, ri, tri, count) => 100 * (count(ri, p) + u * count(tri, p)),
          addCost ? p === 0 ? 0.15 : 0.18 : undefined) }
    ];

    const riagg = (o, ri, u, conid, planid) => {
      const instances = () => ri + 1;
      return map(filter(create(instances, (i) => {
        return {
          id: riid(o, i),
          t: dbclient.t(uid(o, ri, u)),
          conid: cid(o, i),
          planid: [pid(i === 0 ? 0 : 2), mpid(i === 0 ? 0 : 2),
            rpid(i === 0 ? 0 : 2), ppid(i === 0 ? 0 : 2)].join('/')
        };
      }), (c) => {
        return c.conid === conid && c.planid === planid;
      }), (p) => pick(p, 't', 'id'));
    };

    // Resource plan level aggregations for a given consumer at given space
    const scpagg = (o, ri, u, s, c, conid) => {
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
        plan_id: [pid(i === 0 ? 0 : 2), mpid(i === 0 ? 0 : 2),
          rpid(i === 0 ? 0 : 2), ppid(i === 0 ? 0 : 2)].join('/'),
        metering_plan_id: mpid(i === 0 ? 0 : 2),
        rating_plan_id: rpid(i === 0 ? 0 : 2),
        pricing_plan_id: ppid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count, true),
        resource_instances: riagg(o, ri, u, conid, [pid(i === 0 ? 0 : 2),
          mpid(i === 0 ? 0 : 2), rpid(i === 0 ? 0 : 2),
          ppid(i === 0 ? 0 : 2)].join('/'))
      }));
    };

    // Consumer-level Resource Aggregation
    const cagg = (o, ri, u, s) => {
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
          aggregated_usage: a(ri, u, i, count, false),
          plans: scpagg(o, ri, u, s, i, cid(o, i === 0 ? s : s === 0 ? 4 : 5))
        }]
      }));
    };

    // Consumer ids for a given space
    const scagg = (o, ri, u, s) => {
      // Number of consumers at a given resource instance and space indices
      const consumers = () => u === 0 && ri <= 3 + s || tri <= 3 + s ? 1 : 2;

      // Create resource aggregations
      return create(consumers, (i) => ({
        id: cid(o, i === 0 ? s : s === 0 ? 4 : 5)
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
        plan_id: [pid(i === 0 ? 0 : 2), mpid(i === 0 ? 0 : 2),
          rpid(i === 0 ? 0 : 2), ppid(i === 0 ? 0 : 2)].join('/'),
        metering_plan_id: mpid(i === 0 ? 0 : 2),
        rating_plan_id: rpid(i === 0 ? 0 : 2),
        pricing_plan_id: ppid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count, true)
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
          aggregated_usage: a(ri, u, i, count, false),
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
        plan_id: [pid(i === 0 ? 0 : 2), mpid(i === 0 ? 0 : 2),
          rpid(i === 0 ? 0 : 2), ppid(i === 0 ? 0 : 2)].join('/'),
        metering_plan_id: mpid(i === 0 ? 0 : 2),
        rating_plan_id: rpid(i === 0 ? 0 : 2),
        pricing_plan_id: ppid(i === 0 ? 0 : 2),
        aggregated_usage: a(ri, u, i, count, true)
      }));
    };

    // Aggregated usage for a given org, resource instance, usage indices
    // TODO check the values of the accumulated usage
    const aggregatedTemplate = (o, ri, u) => ({
      organization_id: oid(o),
      account_id: '1234',
      start: end + u,
      end: end + u,
      resources: [{
        resource_id: 'test-resource',
        aggregated_usage: a(ri, u, undefined, (n) => n + 1, false),
        plans: opagg(o, ri, u)
      }],
      spaces: osagg(o, ri, u)
    });

    // Aggregated usage for a given consumer
    const consumerTemplate = (o, ri, u) => {
      // Number of spaces at a given resource index
      const spaces = () => u === 0 && ri === 0 || tri === 0 ? 1 : 2;

      return create(spaces, (i) => {
        return extend({
          organization_id: oid(o),
          space_id: sid(o, i)
        }, cagg(o, ri, u, i)[0]);
      })[0];
    };

    const expected = clone(aggregatedTemplate(
      orgs - 1, resourceInstances - 1, usage - 1), pruneWindows);
    const expectedConsumer = clone(consumerTemplate(
      orgs - 1, resourceInstances - 1, usage - 1), pruneWindows);

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

            expect(omit(val.body,
              'id', 'processed', 'processed_id', 'accumulated_usage_id'))
              .to.deep.equal(omit(
                accumulatedTemplate(o, ri, u),
                'id', 'processed', 'processed_id'));

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
              'processed_id', 'consumer_id', 'resource_instance_id',
              '_id', '_rev', 'accumulated_usage_id', 'start']),
              pruneWindows)).to.deep.equal(omit(expected, ['start']));
            done();
          }
          catch (e) {
            // If the test cannot verify the actual data with the expected
            // data within the giveup time, forward the exception
            if(Date.now() >= processingDeadline) {
              debug('Unable to properly verify the last record');
              expect(clone(omit(val.rows[0].doc, ['id', 'processed',
                'processed_id', 'consumer_id', 'resource_instance_id',
                '_id', '_rev', 'accumulated_usage_id', 'start']),
                pruneWindows)).to.deep.equal(omit(expected, ['start']));
            }
            else
              // Try the expected test again
              setTimeout(function() {
                verifyRating(done);
              }, 250);
          }
        });
    };

    const verifyConsumerRating = (done) => {
      const startDate = Date.UTC(new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1) - 1;
      const endDate = Date.UTC(new Date().getUTCFullYear(),
        new Date().getUTCMonth(), 1);
      const sid = dbclient.kturi([expectedConsumer.organization_id,
        expectedConsumer.space_id, expectedConsumer.consumer_id].join('/'),
        seqid.pad16(startDate));
      const eid = dbclient.kturi([expectedConsumer.organization_id,
        expectedConsumer.space_id, expectedConsumer.consumer_id].join('/'),
        seqid.pad16(endDate));
      debug('%o', expectedConsumer);
      debug('comparing latest consumer record within %s and %s', sid, eid);
      db.allDocs({ limit: 1, startkey: sid, endkey: eid, descending: true,
        include_docs: true },
        (err, val) => {
          try {
            map(val.rows[0].doc.resources, (r) => {
              map(r.plans, (p) => {
                p.resource_instances = map(p.resource_instances, (ri) => {
                  return omit(ri, 'p');
                });
              });
            });
            expect(clone(omit(val.rows[0].doc, ['id', 'processed', '_id',
              '_rev', 'processed_id', 'resource_instance_id', 'organization_id',
              'accumulated_usage_id', 'start', 'end']),
                pruneWindows)).to.deep.equal(omit(expectedConsumer, ['start',
                  'end', 'organization_id', 'space_id' ]));
            done();
          }
          catch (e) {
            // If the test cannot verify the actual data with the expected
            // data within the giveup time, forward the exception
            if(Date.now() >= processingDeadline) {
              debug('Unable to properly verify the last record');
              expect(clone(omit(val.rows[0].doc, ['id', 'processed', '_id',
                '_rev', 'processed_id', 'resource_instance_id',
                'organization_id', 'accumulated_usage_id', 'start', 'end']),
                  pruneWindows)).to.deep.equal(omit(expectedConsumer, ['start',
                    'end', 'organization_id', 'space_id']));
            }
            else
              // Try the expected test again
              setTimeout(function() {
                verifyConsumerRating(done);
              }, 250);
          }
        });
    };

    // Wait for usage aggregator to start
    request.waitFor('http://localhost::p/batch',
      { p: 9300 }, startTimeout, (err, value) => {
        // Failed to ping usage aggregator before timing out
        if (err) throw err;

        // Submit accumulated usage and verify
        submit(() => verifyRating(() => verifyConsumerRating(() => done())));
      });
  });
});
