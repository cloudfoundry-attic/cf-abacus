'use strict';

// Simulate a service provider submitting usage for a resource, check the
// usage report for those submissions and measure the performance.

// TODO Use Hystrix metrics for internal performance measurements

// Scenarios:
// - Concurrently submit a usage doc for a resource instance
// - Concurrently submit a usage doc for multiple resource instances
// - Concurrently submit a usage doc for multiple organizations
// - TODO add resource and space variations
// - TODO submit batch of usage docs in each submission

const _ = require('underscore');

const commander = require('commander');

const batch = require('abacus-batch');
const request = require('abacus-request');
const throttle = require('abacus-throttle');
const util = require('util');
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const map = _.map;
const range = _.range;
const omit = _.omit;
const extend = _.extend;
const clone = _.clone;
const last = _.last;
const first = _.first;
const keys = _.keys;

const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-perf-test');

process.env.DB = process.env.DB || 'test';

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'perf');
commander
  .option('-o, --orgs <n>', 'number of organizations', parseInt)
  .option('-i, --instances <n>', 'number of resource instances', parseInt)
  .option('-u, --usagedocs <n>', 'number of usage docs', parseInt)
  .option('-d, --delta <d>',
    'usage time window shift in milli-seconds', parseInt)
  .option('-t, --start-timeout <n>',
    'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>',
    'test timeout in milliseconds', parseInt)
  .option('-c, --collector <uri>',
    'usage collector URL or domain name [http://localhost:9080]',
    'http://localhost:9080')
  .option('-r, --reporting <uri>',
    'usage reporting URL or domain name [http://localhost:9088]',
    'http://localhost:9088')
  .option('-a, --auth-server <uri>',
    'authentication server URL or domain name [http://localhost:9882]',
    'http://localhost:9882')
  .allowUnknownOption(true)
  .parse(argv);

// Number of organizations
const orgs = commander.orgs || 1;

// Number of resource instances
const resourceInstances = commander.instances || 1;

// Number of usage docs
const usage = commander.usagedocs || 1;

// Usage time window shift in milli-seconds
const delta = commander.delta || 0;

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 10000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

// Collector service URL
const collector = commander.collector;

// Reporting service URL
const reporting = commander.reporting;

// Auth server URL
const authServer = commander.authServer;

// Use secure routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const objectStorageToken = secured() ? oauth.cache(authServer,
    process.env.OBJECT_STORAGE_CLIENT_ID,
    process.env.OBJECT_STORAGE_CLIENT_SECRET,
    'abacus.usage.object-storage.write') :
  undefined;

const systemToken = secured() ? oauth.cache(authServer,
    process.env.SYSTEM_CLIENT_ID, process.env.SYSTEM_CLIENT_SECRET,
    'abacus.usage.read') :
  undefined;

describe('abacus-perf-test', () => {
  before((done) => {
    if (objectStorageToken)
      objectStorageToken.start((err) => {
        if (err)
          console.log('Could not fetch object storage token due to, %o', err);
      });

    if (systemToken)
      systemToken.start((err) => {
        if (err)
          console.log('Could not fetch system token due to, %o', err);
      });

    if (/.*localhost.*/.test(collector))
      // Delete test dbs on the configured db server
      dbclient.drop(process.env.DB, /^abacus-/, done);
    else
      done();
  });

  it('measures performance of concurrent usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or
    // a preset timeout
    console.log('Testing with %d orgs, %d resource instances, %d usage docs',
      orgs, resourceInstances, usage);
    const timeout = Math.max(totalTimeout,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);
    const processingDeadline = moment.now() + timeout;

    console.log('Timeout %d', timeout);

    // Return a usage with unique start and end time based on a number
    const start = moment.now() + delta;
    const end = moment.now() + delta;
    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');
    const orgid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      o + 1].join('-');

    const usageTemplate = (o, ri, i) => ({
      start: start + i,
      end: end + i,
      organization_id: orgid(o),
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      resource_id: 'object-storage',
      plan_id: 'basic',
      resource_instance_id: riid(o, ri),
      measured_usage: [{
        measure: 'storage',
        quantity: 1073741824
      }, {
        measure: 'light_api_calls',
        quantity: 1000
      }, {
        measure: 'heavy_api_calls',
        quantity: 100
      }]
    });

    // Compute the test costs
    const storageCost = (nri, n) => new BigNumber(1.00).mul(nri).toNumber();
    const lightCost = (nri, n) => new BigNumber(0.03)
      .mul(nri).mul(n).toNumber();
    const heavyCost = (nri, n) => new BigNumber(0.15)
      .mul(100).mul(nri).mul(n).toNumber();

    const windows = (obj) => {
      const timewindows = [];
      for(let i = 0; i < 5; i++)
        timewindows.push([obj]);
      return timewindows;
    };
    const rwindow = (nri, n, s, m, fn) => {
      return windows({
        charge: fn(nri, n)
      });
    };
    const pwindow = (nri, n, s, m, fn) => {
      return windows({
        quantity: new BigNumber(m).mul(s).toNumber(),
        summary: new BigNumber(m).mul(s).toNumber(),
        cost: fn(nri, n),
        charge: fn(nri, n)
      });
    };
    const cwindow = (nri, n) => {
      return windows({
        charge: new BigNumber(storageCost(nri, n))
          .add(lightCost(nri, n)).add(heavyCost(nri, n)).toNumber()
      });
    };

    // Return the expected usage report for the test organization
    const report = (o, nri, n) => ({
      organization_id: orgid(o),
      account_id: '1234',
      windows: cwindow(nri, n),
      resources: [{
        resource_id: 'object-storage',
        windows: cwindow(nri, n),
        aggregated_usage: [{
          metric: 'storage',
          windows: rwindow(nri, n, nri, 1, storageCost)
        }, {
          metric: 'thousand_light_api_calls',
          windows: rwindow(nri, n, nri * n, 1, lightCost)
        },
        {
          metric: 'heavy_api_calls',
          windows: rwindow(nri, n, nri * n, 100, heavyCost)
        }],
        plans: [{
          plan_id: 'basic/basic-object-storage/' +
            'object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          windows: cwindow(nri, n),
          aggregated_usage: [{
            metric: 'storage',
            windows: pwindow(nri, n, nri, 1, storageCost)
          }, {
            metric: 'thousand_light_api_calls',
            windows: pwindow(nri, n, nri * n, 1, lightCost)
          },
          {
            metric: 'heavy_api_calls',
            windows: pwindow(nri, n, nri * n, 100, heavyCost)
          }]
        }]
      }],
      spaces: [{
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        windows: cwindow(nri, n),
        resources: [{
          resource_id: 'object-storage',
          windows: cwindow(nri, n),
          aggregated_usage: [{
            metric: 'storage',
            windows: rwindow(nri, n, nri, 1, storageCost)
          }, {
            metric: 'thousand_light_api_calls',
            windows: rwindow(nri, n, nri * n, 1, lightCost)
          },
          {
            metric: 'heavy_api_calls',
            windows: rwindow(nri, n, nri * n, 100, heavyCost)
          }],
          plans: [{
            plan_id: 'basic/basic-object-storage/' +
              'object-rating-plan/object-pricing-basic',
            metering_plan_id: 'basic-object-storage',
            rating_plan_id: 'object-rating-plan',
            pricing_plan_id: 'object-pricing-basic',
            windows: cwindow(nri, n),
            aggregated_usage: [{
              metric: 'storage',
              windows: pwindow(nri, n, nri, 1, storageCost)
            }, {
              metric: 'thousand_light_api_calls',
              windows: pwindow(nri, n, nri * n, 1, lightCost)
            },
            {
              metric: 'heavy_api_calls',
              windows: pwindow(nri, n, nri * n, 100, heavyCost)
            }]
          }]
        }],
        consumers: [{
          consumer_id: 'UNKNOWN',
          windows: cwindow(nri, n),
          resources: [{
            resource_id: 'object-storage',
            windows: cwindow(nri, n),
            aggregated_usage: [{
              metric: 'storage',
              windows: rwindow(nri, n, nri, 1, storageCost)
            }, {
              metric: 'thousand_light_api_calls',
              windows: rwindow(nri, n, nri * n, 1, lightCost)
            },
            {
              metric: 'heavy_api_calls',
              windows: rwindow(nri, n, nri * n, 100, heavyCost)
            }],
            plans: [{
              plan_id: 'basic/basic-object-storage/' +
                'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              windows: cwindow(nri, n),
              aggregated_usage: [{
                metric: 'storage',
                windows: pwindow(nri, n, nri, 1, storageCost)
              }, {
                metric: 'thousand_light_api_calls',
                windows: pwindow(nri, n, nri * n, 1, lightCost)
              },
              {
                metric: 'heavy_api_calls',
                windows: pwindow(nri, n, nri * n, 100, heavyCost)
              }]
            }]
          }]
        }]
      }]
    });

    const authHeader = (token) => token ? {
      headers: {
        authorization: token()
      }
    } : {};

    // Post one usage doc, throttled to 1000 concurrent requests
    const post = throttle((o, ri, i, cb) => {
      debug('Submitting org%d instance%d usage%d',
        o + 1, ri + 1, i + 1);
      brequest.post(collector + '/v1/metering/collected/usage',
        extend({}, authHeader(objectStorageToken),
          { body: usageTemplate(o, ri, i) }), (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(201);
            debug('Completed submission org%d instance%d usage%d',
              o + 1, ri + 1, i + 1);
            cb(err, val);
          });
    });

    // Post the requested number of usage docs
    let posts = 0;
    const submit = (done) => {
      const cb = () => {
        if(++posts === orgs * resourceInstances * usage) done();
      };
      map(range(usage), (u) => map(range(resourceInstances), (ri) =>
        map(range(orgs), (o) => post(o, ri, u, cb))));
    };

    // Print the number of usage docs already processed given a get report
    // response, determined from the aggregated usage quantity found in the
    // report for our test resource
    const processed = (val) => {
      try {
        return val.body.resources[0].plans[0].aggregated_usage[1]
          .windows[4][0].summary;
      }
      catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    // Fix up the usage time windows, only keep the month window
    // as we may cross the boundaries of the smaller windows during
    // the execution of the test
    const fixup = (val) => {
      if(!val)
        return val;
      if(val.windows)
        val.windows = [[first(last(val.windows))]];
      map(keys(val), (k) => {
        if(typeof val[k] === 'object')
          fixup(val[k]);
        if(typeof val[k] === 'array')
          map(val[l], fixup);
      });
      return val;
    };


    // Get a usage report for the test organization
    const get = throttle((o, done) => {
      brequest.get(reporting + '/v1/metering/organizations' +
        '/:organization_id/aggregated/usage',
        extend({}, authHeader(systemToken), {
          organization_id: orgid(o)
        }), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Compare the usage report we got with the expected report
          debug('Processed %d usage docs for org%d',
            processed(val), o + 1);
          try {
            // Can't check the dynamic time in resource_instances
            val.body.spaces[0].consumers[0].resources[0].plans[0] =
              omit(val.body.spaces[0].consumers[0]
              .resources[0].plans[0], 'resource_instances');
            const x = fixup(omit(val.body, 'id', 'processed', 'processed_id',
              'start', 'end'));
            const expected = fixup(report(o, resourceInstances, usage));
            expect(x).to.deep.equal(expected);

            console.log('\n', util.inspect(val.body, {
              depth: 20
            }), '\n');

            done();
          }
          catch (e) {
            // If the comparison fails we'll be called again to retry
            // after 250 msec, but give up after the computed timeout
            if(moment.now() >= processingDeadline) {
              console.log('\n', util.inspect(val.body, {
                depth: 20
              }), '\n');
              throw e;
            }
          }
        });
    });

    // Wait for the expected usage report for all organizations, get an
    // organization usage report every 250 msec until we get the expected
    // values indicating that all submitted usage has been processed
    let verified = 0;
    const wait = (done) => {
      console.log('\nRetrieving usage reports');
      const cb = () => {
        if(++verified === orgs) done();
      };

      map(range(orgs), (o) => {
        const i = setInterval(() => get(o, () => cb(clearInterval(i))), 250);
      });
    };

    // Wait for usage reporter to start
    request.waitFor(reporting + '/batch', extend({}, authHeader(systemToken)),
      startTimeout, (err, value) => {
        // Failed to ping usage reporter before timing out
        if (err) throw err;

        // Run the above steps
        submit(() => wait(done));
      });
  });
});
