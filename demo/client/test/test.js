'use strict';

// Simulate a test service provider that submits usage for a service and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');

const request = require('cf-abacus-request');
const util = require('util');

const map = _.map;
const omit = _.omit;

// Take host and time delta parameters
const collector = process.argv[2] && isNaN(process.argv[2]) ? 'https://cf-abacus-usage-collector.' + process.argv[2] : 'http://localhost:9080';
const reporting = process.argv[2] && isNaN(process.argv[2]) ? 'https://cf-abacus-usage-reporting.' + process.argv[2] : 'http://localhost:9088';
const delta = parseInt(process.argv[2]) || parseInt(process.argv[3]) || 0;

describe('cf-abacus-demo-client', () => {
    it('submits usage for a sample storage service and retrieves an aggregated usage report', (done) => {
        this.timeout(30000);

        // Test usage to be submitted by the client
        const usage = [
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365220 + delta, end: 1435629465220 + delta,
                    region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
                [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
            },
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365221 + delta, end: 1435629465221 + delta,
                    region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
                [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
            },
            { message: 'Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
                usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365222 + delta, end: 1435629465222 + delta,
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
        let cbs = 0;
        const post = (u, done) => {
            console.log('        %s', u.message);

            const cb = () => { if(++cbs === usage.length) done(); };

            request.post(collector + '/v1/metering/services/storage/usage', { body: u.usage }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect a 201 with the location of the accumulated usage
                expect(val.statusCode).to.equal(201);
                expect(val.headers.location).to.not.equal(undefined);
                cb();
            });
        };

        // Get usage report for the test organization
        let gets = 0;
        const get = (done) => {
            request.get(reporting + '/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/usage/2015-06-30', {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                // Compare the usage report we got with the expected report
                try {
                    expect(omit(val.body, [ 'id', 'start', 'end' ])).to.deep.equal(report);
                    console.log('\n', util.inspect(val.body, { depth: 10 }), '\n');
                    done();
                }
                catch(e) {
                    // If the comparison fails we'll be called again to retry
                    // after 1 second, but give up after 20 seconds as if we're
                    // still not getting the expected report then something
                    // must have failed in the processing of that usage
                    if(++gets === 20) {
                        console.log('        All submitted usage still not processed\n');
                        throw e;
                    }
                    console.log('        Waiting for all submitted usage to be processed');
                }
            });
        };

        // Wait for the expected usage report, get a report every second until
        // we get the expected values indicating that all submitted usage has
        // been processed
        const wait = (done) => {
            console.log('\n        Retrieving usage report');
            const i = setInterval(() => get(() => done(clearInterval(i))), 1000);
        };

        // Run the above steps
        map(usage, (u) => post(u, () => wait(done)));
    });
});

