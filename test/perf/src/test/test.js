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

const map = _.map;
const range = _.range;
const omit = _.omit;
const clone = _.clone;

const brequest = batch(request);

// Setup the debug log
const debug = require('abacus-debug')('abacus-perf-test');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'perf');
commander
  .option('-o, --orgs <n>', 'number of organizations', parseInt)
  .option('-i, --instances <n>', 'number of resource instances', parseInt)
  .option('-u, --usagedocs <n>', 'number of usage docs', parseInt)
  .option('-d, --delta <d>',
    'usage time window shift in milli-seconds', parseInt)
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

describe('abacus-perf-test', () => {
  it('measures performance of concurrent usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs, with
    // a minimum of 20 secs
    const timeout = Math.max(20000,
      100 * orgs * resourceInstances * usage);
    this.timeout(timeout + 2000);

    // Return a usage with unique start and end time based on a number
    const start = 1435629365220 + delta;
    const end = 1435629465220 + delta;
    const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87',
      o + 1, ri + 1].join('-');
    const orgid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      o + 1].join('-');

    const usageTemplate = (o, ri, i) => ({
      usage: [{
        start: start + i,
        end: end + i,
        region: 'eu-gb',
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
      }]
    });

    // Compute the test costs
    const storageCost = (nri, n) => 1.00 * nri;
    const lightCost = (nri, n) => 0.03 * nri * n;
    const heavyCost = (nri, n) => 0.15 * 100 * nri * n;
    const totalCost = (nri, n) =>
      storageCost(nri, n) + lightCost(nri, n) + heavyCost(nri, n);

    // Return the expected usage report for the test organization
    const report = (o, nri, n) => ({
      organization_id: orgid(o),
      charge: totalCost(nri, n),
      resources: [{
        resource_id: 'object-storage',
        charge: totalCost(nri, n),
        aggregated_usage: [{
          metric: 'storage',
          quantity: 1 * nri,
          summary: 1 * nri,
          charge: storageCost(nri, n)
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 1 * nri * n,
          summary: 1 * nri * n,
          charge: lightCost(nri, n)
        },
          {
            metric: 'heavy_api_calls',
            quantity: 100 * nri * n,
            summary: 100 * nri * n,
            charge: heavyCost(nri, n)
          }],
        plans: [{
          plan_id: 'basic',
          charge: totalCost(nri, n),
          aggregated_usage: [{
            metric: 'storage',
            quantity: 1 * nri,
            summary: 1 * nri,
            cost: storageCost(nri, n),
            charge: storageCost(nri, n)
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 1 * nri * n,
            summary: 1 * nri * n,
            cost: lightCost(nri, n),
            charge: lightCost(nri, n)
          },
            {
              metric: 'heavy_api_calls',
              quantity: 100 * nri * n,
              summary: 100 * nri * n,
              cost: heavyCost(nri, n),
              charge: heavyCost(nri, n)
            }]
        }]
      }],
      spaces: [{
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        charge: totalCost(nri, n),
        resources: [{
          resource_id: 'object-storage',
          charge: totalCost(nri, n),
          aggregated_usage: [{
            metric: 'storage',
            quantity: 1 * nri,
            summary: 1 * nri,
            charge: storageCost(nri, n)
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 1 * nri * n,
            summary: 1 * nri * n,
            charge: lightCost(nri, n)
          },
            {
              metric: 'heavy_api_calls',
              quantity: 100 * nri * n,
              summary: 100 * nri * n,
              charge: heavyCost(nri, n)
            }],
          plans: [{
            plan_id: 'basic',
            charge: totalCost(nri, n),
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1 * nri,
              summary: 1 * nri,
              cost: storageCost(nri, n),
              charge: storageCost(nri, n)
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 1 * nri * n,
              summary: 1 * nri * n,
              cost: lightCost(nri, n),
              charge: lightCost(nri, n)
            },
              {
                metric: 'heavy_api_calls',
                quantity: 100 * nri * n,
                summary: 100 * nri * n,
                cost: heavyCost(nri, n),
                charge: heavyCost(nri, n)
              }]
          }]
        }],
        consumers: [{
          consumer_id: 'ALL',
          charge: totalCost(nri, n),
          resources: [{
            resource_id: 'object-storage',
            charge: totalCost(nri, n),
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1 * nri,
              summary: 1 * nri,
              charge: storageCost(nri, n)
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 1 * nri * n,
              summary: 1 * nri * n,
              charge: lightCost(nri, n)
            },
              {
                metric: 'heavy_api_calls',
                quantity: 100 * nri * n,
                summary: 100 * nri * n,
                charge: heavyCost(nri, n)
              }],
            plans: [{
              plan_id: 'basic',
              charge: totalCost(nri, n),
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1 * nri,
                summary: 1 * nri,
                cost: storageCost(nri, n),
                charge: storageCost(nri, n)
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 1 * nri * n,
                summary: 1 * nri * n,
                cost: lightCost(nri, n),
                charge: lightCost(nri, n)
              },
                {
                  metric: 'heavy_api_calls',
                  quantity: 100 * nri * n,
                  summary: 100 * nri * n,
                  cost: heavyCost(nri, n),
                  charge: heavyCost(nri, n)
                }]
            }]
          }]
        }]
      }]
    });

    // Post one usage doc, throttled to 1000 concurrent requests
    const post = throttle((o, ri, i, cb) => {
      debug('Submitting org%d instance%d usage%d',
        o + 1, ri + 1, i + 1);
      brequest.post('http://localhost:9080/v1/metering/collected/usage',
        { body: usageTemplate(o, ri, i) }, (err, val) => {
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
        return val.body.resources[0].aggregated_usage[1].summary;
      }
      catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    // Return the reporting day for the given time
    const day = (t) => {
      const d = new Date(t);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };

    // Get a usage report for the test organization
    let gets = 0;
    const get = (o, done) => {
      brequest.get('http://localhost:9088' + '/v1/organizations/' +
        orgid(o) + '/usage/:time', { time: day(start) },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Compare the usage report we got with the expected report
          console.log('Processed %d usage docs for org%d',
            processed(val), o + 1);
          try {
            expect(omit(val.body, ['id', 'start', 'end'])).to.deep.
              equal(report(o, resourceInstances, usage));
            console.log('\n', util.inspect(val.body, { depth: 10 }), '\n');
            done();
          }
          catch (e) {
            // If the comparison fails we'll be called again to retry
            // after 250 msec, but give up after the computed timeout
            if(++gets === timeout * Math.max(1, orgs / 4) / 250) throw e;
          }
        });
    };

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

    // Run the above steps
    submit(() => wait(done));
  });
});

