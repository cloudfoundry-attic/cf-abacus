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
          resource_id: 'storage',
          plan_id: 'plan_123',
          resource_instance_id: riid(o, ri),
          metrics: [{
            unit: 'BYTE',
            quantity: 1073741824
          }, {
            unit: 'LIGHT_API_CALL',
            quantity: 1000
          }, {
            unit: 'HEAVY_API_CALL',
            quantity: 100
          }]
        }]
    });

    // Return the expected usage report for the test organization
    const report = (o, nri, n) => ({
        organization_id: orgid(o),
        cost: 0,
        resources: [{
          resource_id: 'storage',
          cost: 0 * nri * n,
          aggregated_usage: [{
            unit: 'STORAGE_PER_MONTH',
            quantity: 1 * nri,
            cost: 0 * nri * n
          }, {
            unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
            quantity: 1 * nri * n,
            cost: 0 * nri * n
          },
            {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 100 * nri * n,
              cost: 0 * nri * n
            }],
          plans: [{
            plan_id: 'plan_123',
            cost: 0 * nri * n,
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 1 * nri,
              cost: 0 * nri * n
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 1 * nri * n,
              cost: 0 * nri * n
            },
              {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 100 * nri * n,
                cost: 0 * nri * n
              }]
          }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          cost: 0 * nri * n,
          resources: [{
            resource_id: 'storage',
            cost: 0 * nri * n,
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 1 * nri,
              cost: 0 * nri * n
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 1 * nri * n,
              cost: 0 * nri * n
            },
              {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 100 * nri * n,
                cost: 0 * nri * n
              }],
            plans: [{
              plan_id: 'plan_123',
              cost: 0 * nri * n,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1 * nri,
                cost: 0 * nri * n
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 1 * nri * n,
                cost: 0 * nri * n
              },
                {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
                  quantity: 100 * nri * n,
                  cost: 0 * nri * n
                }]
            }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            cost: 0 * nri * n,
            resources: [{
              resource_id: 'storage',
              cost: 0 * nri * n,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1 * nri,
                cost: 0 * nri * n
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 1 * nri * n,
                cost: 0 * nri * n
              },
                {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
                  quantity: 100 * nri * n,
                  cost: 0 * nri * n
                }],
              plans: [{
                plan_id: 'plan_123',
                cost: 0 * nri * n,
                aggregated_usage: [{
                  unit: 'STORAGE_PER_MONTH',
                  quantity: 1 * nri,
                  cost: 0 * nri * n
                }, {
                  unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                  quantity: 1 * nri * n,
                  cost: 0 * nri * n
                },
                  {
                    unit: 'HEAVY_API_CALLS_PER_MONTH',
                    quantity: 100 * nri * n,
                    cost: 0 * nri * n
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
      brequest.post('http://localhost:9080/v1/metering/resource/usage',
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
        return val.body.resources[0].aggregated_usage[1].quantity;
      }
      catch (e) {
        // The response doesn't contain a valid report
        return 0;
      }
    };

    // Format a date like expected by the reporting service
    const day = (d) => util.format('%d-%d-%d',
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

    // Get a usage report for the test organization
    let gets = 0;
    const get = (o, done) => {
      brequest.get('http://localhost:9088' + '/v1/organizations/' +
        orgid(o) + '/usage/:day', { day: day(new Date(start)) },
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
      const cb = () => { if(++verified === orgs) done(); };

      map(range(orgs), (o) => {
        const i = setInterval(() => get(o, () => cb(clearInterval(i))), 250);
      });
    };

    // Run the above steps
    submit(() => wait(done));
  });
});

