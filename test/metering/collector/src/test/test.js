'use strict';

const cp = require('child_process');
const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const router = require('abacus-router');
const express = require('abacus-express');
const dbclient = require('abacus-dbclient');

const map = _.map;
const range = _.range;
const clone = _.clone;
const omit = _.omit;

// Batch the requests
const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-collector-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-collector-itest');
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

describe('abacus-usage-collector-itest', () => {
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
      // Start provisioning plugin
      start('abacus-provisioning-plugin');

      // Start account plugin
      start('abacus-account-plugin');

      // Start usage collector
      start('abacus-usage-collector');

      done();
    };

    // Start local database server
    if (!process.env.DB) {
      start('abacus-pouchserver');
      services();
    }
    else
      // Delete test dbs on the configured db server
      dbclient.drop(process.env.DB, /^abacus-collector-/, () => {
        services();
      });
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage collector
    stop('abacus-usage-collector');

    // Stop provisioning plugin
    stop('abacus-provisioning-plugin');

    // Stop account plugin
    stop('abacus-account-plugin');

    // Stop local database server
    if (!process.env.DB)
      stop('abacus-pouchserver');
  });

  it('collect measured usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or
    // predefined timeout
    const timeout = Math.max(totalTimeout,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);
    const processingDeadline = Date.now() + timeout;

    // Setup meter spy
    const meter = spy((req, res, next) => {
      res.status(201).send();
    });

    // Start usage meter stub with the meter spy
    const app = express();
    const routes = router();
    routes.post('/v1/metering/normalized/usage', meter);
    app.use(routes);
    app.use(router.batch(routes));
    app.listen(9100);

    // Initialize usage doc properties with unique values
    const start = 1435629365220 + tshift;
    const end = 1435629465220 + tshift;

    const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      o + 1].join('-');
    const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      o + 1].join('-');
    const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bab',
      o + 1].join('-');
    const pid = (ri, u) => 'basic';

    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');

    // Measured usage for a given org, resource instance and usage #s
    const measuredTemplate = (o, ri, u) => ({
      start: start + u,
      end: end + u,
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      plan_id: pid(ri, u),
      resource_instance_id: riid(o, ri),
      consumer_id: cid(o, ri),
      measured_usage: [
          { measure: 'storage', quantity: 1073741824 },
          { measure: 'light_api_calls', quantity: 1000 },
          { measure: 'heavy_api_calls', quantity: 100 }
      ]
    });

    // Post a measured usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit measured usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      const usage = measuredTemplate(o, ri, u);

      request.post('http://localhost::p/v1/metering/collected/usage',
        { p: 9080, body: usage }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Collected measured usage for org %d instance %d' +
            ' usage %d, verifying it...', o + 1, ri + 1, u + 1);

          let gets = 0;
          const gcb = () => {
            if (++gets === 1) cb();
          };

          // Verify submitted usage docs
          map([val.headers.location], (l, i) => {
            brequest.get(l, undefined, (err, val) => {
              debug('Verify usage #%d for org %d instance %d usage %d ' +
                'from location %s', i + 1, o + 1, ri + 1, u + 1, l);

              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(
                val.body, 'id', 'processed', 'processed_id',
                'collected_usage_id')).to.deep.equal(usage);

              debug('Verified usage #%d for org %d instance %d usage %d',
                i + 1, o + 1, ri + 1, u + 1);

              gcb();
            });
          });

        });
    });

    // Post the requested number of measured usage docs
    const submit = (done) => {
      let posts = 0;
      const cb = () => {
        if(++posts === orgs * resourceInstances * usage) done();
      };

      // Submit measured usage for all orgs and resource instances
      map(range(usage), (u) => map(range(resourceInstances),
        (ri) => map(range(orgs), (o) => post(o, ri, u, cb))));
    };

    const verifyMetering = (done) => {
      try {
        debug('Verifying metering calls %d to equal to %d',
          meter.callCount, orgs * resourceInstances * usage);

        // TODO check the values of the normalized usage
        expect(meter.callCount).to.equal(orgs * resourceInstances * usage);
        done();
      }
      catch (e) {
        // If the comparison fails we'll be called again to retry
        // after 250 msec, but give up after deadline
        if(Date.now() >= processingDeadline) throw e;

        debug('Gave up after %d ms', processingDeadline);
      }
    };

    // Wait for usage collector to start
    request.waitFor('http://localhost::p/batch',
      { p: 9080 }, startTimeout, (err, value) => {
        // Failed to ping usage collector before timing out
        if (err) throw err;

        // Submit measured usage and verify
        submit(() => {
          const i = setInterval(() =>
            verifyMetering(() => done(clearInterval(i))), 250);
        });
      });
  });
});
