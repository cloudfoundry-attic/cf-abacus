'use strict';

const cp = require('child_process');
const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const request = require('abacus-request');

const map = _.map;
const range = _.range;
const clone = _.clone;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-rate-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-rate-itest');
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

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the aggregation end time for a given time
const eod = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(),
    d.getUTCDate() + 1) - 1;
};

// Extend an object using an interceptor
// if interceptor returns a value, then use it to replace the original value
const cextend = (o, interceptor) => {
  const deepcopy = (k, v) => {
    // if value is an object, then extend it using the interceptor
    if(typeof v === 'object') return cextend(v, interceptor);
    return v;
  };

  // Go through object keys and extend
  map(o, (v, k) => { o[k] = interceptor(k, v) || deepcopy(k, v); });
  return o;
};

// Add cost to aggregated usage at all plan levels
const addCost = (k, v) => {
  // plan and price details for test-resource to do a quick lookup
  const cost = {
    basic: {
      storage: 1,
      'thousand_light_api_calls': 0.03,
      'heavy_api_calls': 0.15
    },
    standard: {
      storage: 0.5,
      'thousand_light_api_calls': 0.04,
      'heavy_api_calls': 0.18
    }
  };

  // all plan level aggregations need cost as part of aggregated_usage
  if (k === 'plans') return map(v, (p) => {
    // Warning: mutating aggregated_usage to include cost
    p.aggregated_usage = map(p.aggregated_usage, (u) => {
      u.cost = u.quantity * cost[p.plan_id][u.metric];
      return u;
    });

    return p;
  });
};

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

describe('abacus-usage-rate-itest', () => {
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

    // Start account management stub
    start('abacus-account-stub');

    // Start usage rating service
    start('abacus-usage-rate');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage rating service
    stop('abacus-usage-rate');

    // Stop account management stub
    stop('abacus-account-stub');

    // Stop local database server
    stop('abacus-dbserver');
  });

  it('rate aggregated usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 20 secs
    const timeout = Math.max(20000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Initialize usage doc properties with unique values
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
      { metric: 'storage', quantity: u === 0 ? count(ri, p) : count(tri, p) },
      { metric: 'thousand_light_api_calls',
        quantity: count(ri, p) + u * count(tri, p) },
      { metric: 'heavy_api_calls',
        quantity: 100 * (count(ri, p) + u * count(tri, p)) }
    ];

    // Resouce plan level aggregations for a given consumer at given space
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
    const aggregatedTemplate = (o, ri, u) => ({
      organization_id: oid(o),
      start: day(end + u),
      end: eod(end + u),
      resources: [{
        resource_id: 'test-resource',
        aggregated_usage: a(ri, u, undefined, (n) => n + 1),
        plans: opagg(o, ri, u)
      }],
      spaces: osagg(o, ri, u)
    });

    // Post an aggregated usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit aggregated usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.post('http://localhost::p/v1/rating/usage',
        { p: 9410, body: aggregatedTemplate(o, ri, u) }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Rated aggregated usage for org%d instance%d' +
            ' usage%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify rated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, ['id'])).to.deep
              .equal(cextend(aggregatedTemplate(o, ri, u), addCost));

            debug('Verified rated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            cb();
          });
        });
    });

    // Post the requested number of aggregated usage docs
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if(++posts === orgs * resourceInstances * usage) done();
      };

      // Submit usage for all orgs and resource instances
      map(range(usage), (u) => map(range(resourceInstances),
        (ri) => map(range(orgs), (o) => post(o, ri, u, cb))));
    };

    // Wait for usage rating service to start
    request.waitFor('http://localhost::p/batch',
      { p: 9410 }, (err, value) => {
        // Failed to ping usage rating service before timing out
        if (err) throw err;

        // Submit aggregated usage and verify
        submit(done);
      });
  });
});
