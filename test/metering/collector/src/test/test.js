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

describe('abacus-usage-collector-itest', () => {
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

    // Start provisioning service
    start('abacus-provisioning-stub');

    // Start usage collector
    start('abacus-usage-collector');
  });

  after(() => {
    const stop = (module) => {
      cp.spawn('npm', ['run', 'stop'],
        { cwd: moduleDir(module), env: clone(process.env) });
    };

    // Stop usage collector
    stop('abacus-usage-collector');

    // Stop provisioning service
    stop('abacus-provisioning-stub');

    // Stop local database server
    stop('abacus-dbserver');
  });

  it('collect measured usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 20 secs
    const timeout = Math.max(20000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Setup meter spy
    const meter = spy((req, res, next) => {
      res.status(201).send();
    });

    // Start usage meter stub with the meter spy
    const app = express();
    const routes = router();
    routes.post('/v1/metering/usage', meter);
    app.use(routes);
    app.use(router.batch(routes));
    app.listen(9081);

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

    // Measured usage for a given org, resource instance and usage #s
    const measuredTemplate = (o, ri, u) => ({
      usage: [{
        start: start + u,
        end: end + u,
        region: rid(o),
        organization_id: oid(o),
        space_id: sid(o, ri),
        resource_id: 'test-resource',
        plan_id: pid(ri, u),
        resource_instance_id: riid(o, ri),
        consumer: { type: 'EXTERNAL', consumer_id: cid(o, ri) },
        measured_usage: [
            { measure: 'storage', quantity: 1073741824 },
            { measure: 'light_api_calls', quantity: 1000 },
            { measure: 'heavy_api_calls', quantity: 100 }
        ]
      }, {
        start: start + u,
        end: end + u,
        region: rid(o),
        organization_id: oid(o),
        space_id: sid(o, ri),
        resource_id: 'test-resource',
        plan_id: pid(ri, u),
        resource_instance_id: riid(o, ri),
        consumer: { type: 'EXTERNAL', consumer_id: cid(o, ri) },
        measured_usage: [
            { measure: 'storage', quantity: 2147483648 },
            { measure: 'light_api_calls', quantity: 2000 },
            { measure: 'heavy_api_calls', quantity: 200 }
        ]
      }]
    });

    // Post a measured usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit measured usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      const usage = measuredTemplate(o, ri, u);

      request.post('http://localhost::p/v1/metering/resource/usage',
        { p: 9080, body: usage }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);
          expect(val.body.length).to.equal(2);

          debug('Collected measured usage for org%d instance%d' +
            ' usage%d, verifying it...', o + 1, ri + 1, u + 1);

          let gets = 0;
          const gcb = () => {
            if (++gets === 3) cb();
          };

          // Verify normalized and submitted usage docs
          map(val.body.concat(val.headers.location), (l, i) => {
            brequest.get(l, undefined, (err, val) => {
              debug('Verify usage#%d for org%d instance%d usage%d',
                i + 1, o + 1, ri + 1, u + 1);

              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, ['id', 'usage_batch_id'])).to.deep
                .equal(i < 2 ? usage.usage[i] : usage);

              debug('Verified usage#%d for org%d instance%d usage%d',
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

    let retries = 0;
    const verifyMetering = (done) => {
      try {
        debug('Verifying metering calls %d to equal to %d',
          meter.callCount, 2 * orgs * resourceInstances * usage);

        expect(meter.callCount).to.equal(2 * orgs * resourceInstances * usage);
        done();
      }
      catch (e) {
        // If the comparison fails we'll be called again to retry
        // after 250 msec, but give up after 10 seconds
        if(++retries === 40) throw e;

        debug('Retry#%d', retries);
      }
    };

    // Wait for usage collector to start
    request.waitFor('http://localhost::p/batch',
      { p: 9080 }, (err, value) => {
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
