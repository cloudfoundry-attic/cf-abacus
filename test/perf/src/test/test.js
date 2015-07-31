'use strict';

// Simulate a service provider submitting usage for a service, check the
// response and measure the performance.

// TODO Use Hystrix metrics for internal performance measurements

// Scenarios:
// - single service instance, concurrent individual usage submissions
// - TODO add service, service instance, org, and space variations
// - TODO add batch submissions

const _ = require('underscore');

const request = require('cf-abacus-request');
const throttle = require('cf-abacus-throttle');
const util = require('util');

const map = _.map;
const range = _.range;
const omit = _.omit;

// Setup the debug log
const debug = require('cf-abacus-debug')('cf-abacus-test-perf');

// Take number of usage submissions as first parameter
const submissions = parseInt(process.argv[2]) || 1;

// Take a delta time as second parameter
const delta = parseInt(process.argv[3]) || 0;

describe('cf-abacus-test-perf', () => {
    it.only('measures the performance of concurrent usage submissions', function(done) {
        // Configure the test timeout based on the number of submissions, with
        // a minimum of 20 secs
        const timeout = Math.max(20000, 100 * submissions);
        this.timeout(timeout + 2000);

        // Return a usage with unique start and end time based on a number
        const start = 1435629365220 + delta;
        const end = 1435629465220 + delta;
        const usage = (i) => ({ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: start + i,
            end: end + i, region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            plan_id: 'plan_123', resources: [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }]
        });

        // Return the expected usage report for the test organization
        const report = (n) => ({ organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * n }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * n }] }],
            spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * n }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * n }] }],
            consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 1 * n }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 100 * n }] }] }] }] });

        // Post one usage doc, throttled to 1000 concurrent requests
        const post = throttle((i, cb) => {
            debug('Submission #%d', i + 1);
            request.post('http://localhost:9080/v1/metering/services/storage/usage', { body: usage(i) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);
                debug('Completed submission #%o', i + 1);
                cb(err, val);
            });
        });

        // Post the requested number of usage docs
        let posts = 0;
        const submit = (done) => {
            const cb = () => { if(++posts === submissions) done(); };
            map(range(submissions), (i) => post(i, cb));
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
        const get = (done) => {
            request.get('http://localhost:9088' + '/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/usage/:day', { day: day(new Date(start)) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // Compare the usage report we got with the expected report
                console.log('Processed %d usage docs', processed(val));
                try {
                    expect(omit(val.body, [ 'id', 'start', 'end' ])).to.deep.equal(report(submissions));
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

        // Wait for the expected usage report, get a report every 250 msec until
        // we get the expected values indicating that all submitted usage has
        // been processed
        const wait = (done) => {
            console.log('\nRetrieving usage report');
            const i = setInterval(() => get(() => done(clearInterval(i))), 250);
        };

        // Run the above steps
        submit(() => wait(done));
    });
});

