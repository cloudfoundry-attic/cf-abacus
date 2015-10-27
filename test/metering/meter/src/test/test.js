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
const clone = _.clone;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-meter-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-meter-itest');
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

describe('abacus-usage-meter-itest', () => {
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

    // Start usage meter
    start('abacus-usage-meter');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage meter
    stop('abacus-usage-meter');

    // Stop local database server
    stop('abacus-dbserver');
  });

  it('meter normalized usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 60 secs
    const timeout = Math.max(60000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Setup accumulator spy
    const accumulate = spy((req, res, next) => {
      res.status(201).send();
    });

    // Start usage accumulator stub with the accumulate spy
    const app = express();
    const routes = router();
    routes.post('/v1/metering/metered/usage', accumulate);
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

    const bid = (u) => [start, u + 1].join('-');

    // Measured usage for a given org, resource instance and usage #s
    const normalizedTemplate = (o, ri, u) => ({
      collected_usage_id: bid(u),
      start: start + u,
      end: end + u,
      region: rid(o),
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      resource_instance_id: riid(o, ri),
      plan_id: pid(ri, u),
      consumer_id: cid(o, ri),
      measured_usage: [
        { measure: 'storage', quantity: 1073741824 },
        { measure: 'light_api_calls', quantity: 1000 },
        { measure: 'heavy_api_calls', quantity: 100 },
        { measure: 'instance_memory', quantity: 3 },
        { measure: 'running_instances', quantity: 2 }
      ]
    });

    // Metered usage for given org, resource instance and usage #s
    // TODO check the values of the metered usage
    /*
    const meteredTemplate = (o, ri, u) => extend(normalizedTemplate(o, ri, u), {
      metered_usage: [
        { metric: 'storage', quantity: 1 },
        { metric: 'thousand_light_api_calls', quantity: 1 },
        { metric: 'heavy_api_calls', quantity: 100 },
        { metric: 'memory', quantity: { consuming: 6, since: start + u }}
      ]
    });
    */

    // Post a normalized usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit normalized usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.post('http://localhost::p/v1/metering/normalized/usage',
        { p: 9100, body: normalizedTemplate(o, ri, u) }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Normalized usage for org%d instance%d' +
            'usage%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, 'id', 'processed'))
              .to.deep.equal(normalizedTemplate(o, ri, u));

            debug('Verified usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            cb();
          });
        });
    });

    // Post the requested number of normalized usage docs
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
    const verifyAccumulator = (done) => {
      try {
        debug('Verifying accumulator calls %d to equal to %d',
          accumulate.callCount, orgs * resourceInstances * usage);

        // TODO check the values of the metered usage
        expect(accumulate.callCount).to.equal(orgs * resourceInstances * usage);
        done();
      }
      catch (e) {
        // If the comparison fails we'll be called again to retry
        // after 250 msec, but give up after 10 seconds
        if(++retries === 40) throw e;

        debug('Retry#%d', retries);
      }
    };

    // Wait for usage meter to start
    request.waitFor('http://localhost::p/batch',
      { p: 9100 }, (err, value) => {
        // Failed to ping usage meter before timing out
        if (err) throw err;

        // Submit normalized usage and verify
        submit(() => {
          const i = setInterval(() =>
            verifyAccumulator(() => done(clearInterval(i))), 250);
        });
      });
  });
});
