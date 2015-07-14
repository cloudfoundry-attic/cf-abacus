'use strict';

// Simulate a test service provider that submits usage for a service and
// verifies the submission by retrieving a usage report.

const _ = require('underscore');
const map = _.map;
const omit = _.omit;

const request = require('cf-abacus-request');
const util = require('util');

// Take host and time delta parameters
const collector = process.argv[2] && isNaN(process.argv[2]) ? 'https://cf-abacus-usage-collector.' + process.argv[2] : 'http://localhost:9080';
const reporting = process.argv[2] && isNaN(process.argv[2]) ? 'https://cf-abacus-usage-reporting.' + process.argv[2] : 'http://localhost:9088';
const delta = parseInt(process.argv[2]) || parseInt(process.argv[3]) || 0;

describe('cf-abacus-demo-client', () => {
    it('submits usage for storage service and verifies the submission using usage report', (done) => {
        this.timeout(60000);

        // Test usage to be submitted by the client
        const tests = [{ message: '        Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
            usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365220 + delta, end: 1435629465220 + delta,
                region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
            [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
        },
        { message: '        Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
            usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365221 + delta, end: 1435629465221 + delta,
                region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
            [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
        },
        { message: '        Submitting 10 GB, 1000 light API calls, 100 heavy API calls',
            usage :{ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365222 + delta, end: 1435629465222 + delta,
                region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', plan_id: 'plan_123', resources:
            [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }] }
        }];

        // Expected usage report for the test organization
        const expected = { organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
            spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
            consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
            [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }] }] }] };

        // Submit usage for storage service with 10 GB, 1000 light API calls, and 100 heavy API calls
        let cbs = 0;
        const post = (t, done) => {
            console.log(t.message);

            const cb = () => { if(++cbs === tests.length) done(); };

            request.post(collector + '/v1/metering/services/storage/usage', { body: t.usage }, (err, val) => {
                expect(err).to.equal(undefined);

                // Expect a 201 with the location of the accumulated usage
                expect(val.statusCode).to.equal(201);
                expect(val.headers.location).to.not.equal(undefined);
                cb();
            });
        };

        // Get usage report for the test organization
        const get = (done) => {
            console.log('\n        Retrieving usage report');

            request.get(reporting + '/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/usage/2015-06-30', {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                console.log('\n', util.inspect(val.body, { depth: 10 }), '\n');
                expect(omit(val.body, [ 'id', 'start', 'end' ])).to.deep.equal(expected);

                done();
            });
        };

        // Run the above steps
        map(tests, (t) => post(t, () => {
            console.log('\n        Waiting 1 second to make sure usage has been processed');
            setTimeout(() => get(done), 1000);
        }));
    });
});
