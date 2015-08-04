'use strict';

// Simulate a service provider submitting usage for a service, check the
// usage report for those submissions and measure the performance.

// TODO Use Hystrix metrics for internal performance measurements

// Scenarios:
// - Concurrently submit a usage doc for a service instance
// - Concurrently submit a usage doc for multiple service instances
// - Concurrently submit a usage doc for multiple organizations
// - TODO add service and space variations
// - TODO submit batch of usage docs in each submission

const _ = require('underscore');

const commander = require('commander');

const request = require('abacus-request');
const throttle = require('abacus-throttle');
const util = require('util');

const map = _.map;
const range = _.range;
const omit = _.omit;

// Setup the debug log
const debug = require('abacus-debug')('abacus-test-perf');

commander.option('-o, --orgs <n>', 'Number of organizations', parseInt);
commander.option('-i, --instances <n>', 'Number of service instances', parseInt);
commander.option('-u, --usagedocs <n>', 'Number of usage docs', parseInt);
commander.option('-d, --delta <d>', 'Usage time window shift in milli-seconds', parseInt);

commander.parse(process.argv);

// Number of organizations
const orgs = commander.orgs || 1;

// Number of service instances
const serviceInstances = commander.instances || 1;

// Number of usage docs
const usage = commander.usagedocs || 1;

// Usage time window shift in milli-seconds
const delta = commander.delta || 0;

describe('abacus-test-perf', () => {
    it.only('measures the performance of concurrent usage submissions', function(done) {
        // Configure the test timeout based on the number of usage docs, with
        // a minimum of 20 secs
        const timeout = Math.max(20000, 100 * orgs * serviceInstances * usage);
        this.timeout(timeout + 2000);

        // Return a usage with unique start and end time based on a number
        const start = 1435629365220 + delta;
        const end = 1435629465220 + delta;
        const siid = (o, si) => ['0b39fa70-a65f-4183-bae8-385633ca5c87', o + 1, si + 1].join('-');
        const orgid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', o + 1].join('-');

        const usageTemplate = (o, si, i) => ({ service_instances: [{ service_instance_id: siid(o, si), usage: [{ start: start + i,
            end: end + i, region: 'eu-gb', organization_guid: orgid(o), space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            plan_id: 'plan_123', resources: [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }]
        });

        // Return the expected usage report for the test organization
        const report = (o, nsi, n) => ({ organization_guid: orgid(o), services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 * nsi }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * nsi * n },
             { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * nsi * n }] }],
            spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 * nsi }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * nsi * n },
             { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * nsi * n }] }],
            consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 * nsi }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * nsi * n },
             { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * nsi * n }] }]
        }] }] });

        // Post one usage doc, throttled to 1000 concurrent requests
        const post = throttle((o, si, i, cb) => {
            debug('Submitting org%d instance%d usage%d', o + 1, si + 1, i + 1);
            request.post('http://localhost:9080/v1/metering/services/storage/usage', { body: usageTemplate(o, si, i) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);
                debug('Completed submission org%d instance%d usage%d', o + 1, si + 1, i + 1);
                cb(err, val);
            });
        });

        // Post the requested number of usage docs
        let posts = 0;
        const submit = (done) => {
            const cb = () => { if(++posts === orgs * serviceInstances * usage) done(); };
            map(range(orgs), (o) => map(range(serviceInstances), (si) => map(range(usage), (i) => post(o, si, i, cb))));
        };

        // Print the number of usage docs already processed given a get report
        // response, determined from the aggregated usage quantity found in the
        // report for our test service
        const processed = (val) => {
            try {
                return val.body.services[0].aggregated_usage[1].quantity;
            }
            catch(e) {
                // The response doesn't contain a valid report
                return 0;
            }
        };

        // Format a date like expected by the reporting service
        const day = (d) => util.format('%d-%d-%d', d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

        // Get a usage report for the test organization
        let gets = 0;
        const get = (o, done) => {
            request.get('http://localhost:9088' + '/v1/organizations/' + orgid(o) + '/usage/:day', { day: day(new Date(start)) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // Compare the usage report we got with the expected report
                console.log('Processed %d usage docs for org%d', processed(val), o + 1);
                try {
                    expect(omit(val.body, [ 'id', 'start', 'end' ])).to.deep.equal(report(o, serviceInstances, usage));
                    console.log('\n', util.inspect(val.body, { depth: 10 }), '\n');
                    done();
                }
                catch(e) {
                    // If the comparison fails we'll be called again to retry
                    // after 1 second, but give up after the computed timeout
                    if(++gets === timeout / 250)
                        throw e;
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
            map(range(orgs), (o) => { const i = setInterval(() => get(o, () => cb(clearInterval(i))), 250); });
        };

        // Run the above steps
        submit(() => wait(done));
    });
});
