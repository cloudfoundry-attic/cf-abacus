'use strict';

const cp = require('child_process');
const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const router = require('abacus-router');
const express = require('abacus-express');

const map = _.map;
const range = _.range;
const extend = _.extend;
const clone = _.clone;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-accumulator-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-accumulator-itest');
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

// Builds the quantity array in the accumulated usage
const buildQuantity = (e, u, m, f) => {
  // Scaling factor for a time window
  // [Second, Minute, Hour, Day, Month]
  const timescale = [1, 100, 10000, 1000000, 100000000];
  const quantity = map(timescale, (ts) => {
    // If this is the first usage, only return current
    if(u === 0)
      return { current: f(m, u + 1) };
    // Return a properly accumulated current & previous
    return {
      previous: calculateQuantityByWindow(e, u, ts, m, f),
      current: calculateQuantityByWindow(e, u + 1, ts, m, f)
    };
  });
  return quantity;
};

describe('abacus-usage-accumulator-itest', () => {
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

    // Start usage accumulator
    start('abacus-usage-accumulator');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage accumulator
    stop('abacus-usage-accumulator');

    // Stop local database server
    stop('abacus-dbserver');
  });

  it('accumulate metered usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 20 secs
    const timeout = Math.max(20000,
      100 * orgs * resourceInstances * usage);
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
    app.listen(9200);

    // Initialize usage doc properties with unique values
    const start = 1435629365220 + tshift;
    const end = 1435629465220 + tshift;

    const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      o + 1].join('-');
    const rid = (o) => o % 2 === 0 ? 'us-south' : 'eu-gb';
    const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      o + 1].join('-');
    const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bab',
      o + 1].join('-');
    const pid = (ri, u) => 'basic';

    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');

    const uid = (o, ri, u) => [start, o + 1, ri + 1, u + 1].join('-');
    const bid = (u) => [start, u + 1].join('-');

    // Return a usage with unique start and end time based on a number
    const meteredTemplate = (o, ri, u) => ({
      id: uid(o, ri, u),
      collected_usage_id: bid(o, ri, u),
      start: start + u,
      end: end + u,
      region: rid(o),
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      resource_instance_id: riid(o, ri),
      plan_id: pid(ri, u),
      consumer: { type: 'EXTERNAL', consumer_id: cid(o, ri) },
      metered_usage: [
        { metric: 'storage', quantity: 1 },
        { metric: 'thousand_light_api_calls', quantity: 1 },
        { metric: 'heavy_api_calls', quantity: 100 }
      ]
    });

    const accumulatedTemplate = (o, ri, u) => extend(
      omit(meteredTemplate(o, ri, u), ['id', 'metered_usage',
        'measured_usage', 'start']), {
          accumulated_usage: [
            {
              metric: 'storage',
              quantity: buildQuantity(end, u, 1, (m, u) => m)
            },
            {
              metric: 'thousand_light_api_calls',
              quantity: buildQuantity(end, u, 1, (m, u) => m * u)
            },
            {
              metric: 'heavy_api_calls',
              quantity: buildQuantity(end, u, 100, (m, u) => m * u)
            }
          ],
          start: meteredTemplate(o, ri, 0).start
        }
    );

    // Post a metered usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit metered usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.post('http://localhost::p/v1/metering/metered/usage',
        { p: 9100, body: meteredTemplate(o, ri, u) }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Accumulated metered usage for org%d instance%d' +
            ' usage%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify accumulated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, ['id', 'processed_usage_id'])).to.deep
              .equal(accumulatedTemplate(o, ri, u));

            debug('Verified accumulated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            cb();
          });
        });
    });

    // Post the requested number of metered usage docs
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if(++posts === orgs * resourceInstances * usage) done();
      };

      // Submit usage for all orgs and resource instances
      map(range(usage), (u) => map(range(resourceInstances),
        (ri) => map(range(orgs), (o) => post(o, ri, u, cb))));
    };

    let retries = 0;
    const verifyAggregator = (done) => {
      try {
        debug('Verifying aggregator calls %d to equal to %d',
          aggregator.callCount, orgs * resourceInstances * usage);

        expect(aggregator.callCount).to.equal(orgs * resourceInstances * usage);
        done();
      }
      catch (e) {
        // If the comparison fails we'll be called again to retry
        // after 250 msec, but give up after 10 seconds
        if(++retries === 40) throw e;

        debug('Retry#%d', retries);
      }
    };

    // Wait for usage accumulator to start
    request.waitFor('http://localhost::p/batch',
      { p: 9100 }, (err, value) => {
        // Failed to ping usage accumulator before timing out
        if (err) throw err;

        // Submit metered usage and verify
        submit(() => {
          const i = setInterval(() =>
            verifyAggregator(() => done(clearInterval(i))), 250);
        });
      });
  });
});
