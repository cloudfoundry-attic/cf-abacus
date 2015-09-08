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
const debug = require('abacus-debug')('abacus-usage-aggregator-itest');

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

// Module directory
const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
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

  it('aggregate accumulated usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 20 secs
    const timeout = Math.max(20000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Setup rate spy
    const rate = spy((req, res, next) => { res.status(201).send(); });

    // Start usage rate stub with the rate spy
    const app = express();
    const routes = router();
    routes.post('/v1/rating/usage', rate);
    app.use(routes);
    app.use(router.batch(routes));
    app.listen(9410);

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

    // Accumulated usage for given org, resource instance and usage #s
    const accumulatedTemplate = (o, ri, u) => ({
      id: uid(o, ri, u),
      usage_batch_id: bid(o, ri, u),
      start: start + u,
      end: end + u,
      region: rid(o),
      organization_id: oid(o),
      space_id: sid(o, ri),
      resource_id: 'test-resource',
      resource_instance_id: riid(o, ri),
      plan_id: pid(ri, u),
      consumer: { type: 'EXTERNAL', consumer_id: cid(o, ri) },
      measured_usage: [
        { measure: 'storage', quantity: 1073741824 },
        { measure: 'light_api_calls', quantity: 1000 },
        { measure: 'heavy_api_calls', quantity: 100 }
      ],
      accumulated_usage: [
        {
          metric: 'storage', quantity: u === 0 ? {
            current: 1
          } : {
            previous: 1,
            current: 1
          }
        },
        {
          metric: 'thousand_light_api_calls', quantity: u === 0 ? {
            current: u + 1
          } : {
            previous: u,
            current: u + 1
          }
        },
        {
          metric: 'heavy_api_calls', quantity: u === 0 ? {
            current: 100 * (u + 1)
          } : {
            previous: 100 * u,
            current: 100 * (u + 1)
          }
        }
      ]
    });

    // Aggregated usage
    const aggregated = (o, ri, u) => [
      { metric: 'storage',
        quantity: ri < resourceInstances && u === 0 ?
        ri + 1 : resourceInstances },
      { metric: 'thousand_light_api_calls',
        quantity: ri + 1 + u * resourceInstances },
      { metric: 'heavy_api_calls',
        quantity: 100 * (ri + 1 + u * resourceInstances) }
    ];

    // Plan aggregated usage
    const paggregated = (o, ri, u) => [{
      plan_id: pid(ri, u),
      aggregated_usage: aggregated(o, ri, u)
    }];

    // Aggregated usage for a given org, resource instance, usage #s
    const aggregatedTemplate = (o, ri, u) => ({
      accumulated_usage_id: uid(o, ri, u),
      organization_id: oid(o),
      start: day(end + u),
      end: eod(end + u),
      resources: [{
        resource_id: 'test-resource',
        aggregated_usage: aggregated(o, ri, u),
        plans: paggregated(o, ri, u)
      }],
      spaces: [{
        space_id: sid(o, ri),
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: aggregated(o, ri, u),
          plans: paggregated(o, ri, u)
        }],
        consumers: [{
          consumer_id: cid(o, ri),
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: aggregated(o, ri, u),
            plans: paggregated(o, ri, u)
          }]
        }]
      }]
    });

    // Post an accumulated usage doc, throttled to default concurrent requests
    const post = throttle((o, ri, u, cb) => {
      debug('Submit accumulated usage for org%d instance%d usage%d',
        o + 1, ri + 1, u + 1);

      brequest.post('http://localhost::p/v1/metering/accumulated/usage',
        { p: 9200, body: accumulatedTemplate(o, ri, u) }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.not.equal(undefined);

          debug('Aggregated accumulated usage for org%d instance%d' +
            ' usage%d, verifying it...', o + 1, ri + 1, u + 1);

          brequest.get(val.headers.location, undefined, (err, val) => {
            debug('Verify aggregated usage for org%d instance%d usage%d',
              o + 1, ri + 1, u + 1);

            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            expect(omit(val.body, ['id'])).to.deep
              .equal(aggregatedTemplate(o, ri, u));

            debug('Verified aggregated usage for org%d instance%d usage%d',
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

    let retries = 0;
    const verifyRating = (done) => {
      try {
        debug('Verifying rating calls %d to equal to %d',
          rate.callCount, orgs * resourceInstances * usage);

        expect(rate.callCount).to.equal(orgs * resourceInstances * usage);
        done();
      }
      catch (e) {
        // If the comparison fails we'll be called again to retry
        // after 250 msec, but give up after 10 seconds
        if(++retries === 40) throw e;

        debug('Retry#%d', retries);
      }
    };

    // Wait for usage aggregator to start
    request.waitFor('http://localhost::p/batch',
      { p: 9200 }, (err, value) => {
        // Failed to ping usage aggregator before timing out
        if (err) throw err;

        // Submit accumulated usage and verify
        submit(() => {
          const i = setInterval(() =>
            verifyRating(() => done(clearInterval(i))), 250);
        });
      });
  });
});
