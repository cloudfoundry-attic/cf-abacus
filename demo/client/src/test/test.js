'use strict';

// Simulate a test service provider that submits usage for a service and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');

const request = require('abacus-request');
const util = require('util');

const map = _.map;
const omit = _.omit;

// Take host and time delta parameters
const collector = process.argv[2] && isNaN(process.argv[2]) ? 'https://abacus-usage-collector.' + process.argv[2] : 'http://localhost:9080';
const reporting = process.argv[2] && isNaN(process.argv[2]) ? 'https://abacus-usage-reporting.' + process.argv[2] : 'http://localhost:9088';
const delta = parseInt(process.argv[2]) || parseInt(process.argv[3]) || 0;

describe('abacus-demo-client', () => {
    it('submits usage for a sample storage service and retrieves an aggregated usage report', function(done) {
        // Configure the test timeout
        const timeout = 20000;
        this.timeout(timeout + 2000);

        // Test usage to be submitted by the client
        const start = 1435629365220 + delta;
        const end = 1435629465220 + delta;
        const usage = [
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: start, end: end,
                    region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
                [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
            },
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: start + 1, end: end + 1,
                    region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
                [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
            },
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: start + 2, end: end + 2,
                    region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
                [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
            }];

        // Expected usage report for the test organization
        const report = { organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
            spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
            consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }] }] }] };

        // Submit usage for storage service with 10 GB, 1000 light API calls, and 100 heavy API calls
        let posts = 0;
        const post = (u, done) => {
            console.log(u.message);

            const cb = () => { if(++posts === usage.length) done(); };

            request.post(collector + '/v1/metering/services/storage/usage', { body: u.usage }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect a 201 with the location of the accumulated usage
                expect(val.statusCode).to.equal(201);
                expect(val.headers.location).to.not.equal(undefined);
                cb();
            });
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
            request.get(reporting + '/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/usage/:day', { day: day(new Date(start)) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // Compare the usage report we got with the expected report
                console.log('Processed %d usage docs', processed(val));
                try {
                    expect(omit(val.body, [ 'id', 'start', 'end' ])).to.deep.equal(report);
                    console.log('\n', util.inspect(val.body, { depth: 10 }), '\n');
                    done();
                }
                catch(e) {
                    // If the comparison fails we'll be called again to retry
                    // after 1 second, give up after the configured timeout
                    // still not getting the expected report then something
                    // must have failed in the processing of that usage
                    if(++gets === timeout / 250) {
                        console.log('All submitted usage still not processed\n');
                        throw e;
                    }
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
        map(usage, (u) => post(u, () => wait(done)));
    });
});

