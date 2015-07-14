'use strict';

// Simulate a service provider submitting usage for a service, check the
// response and measure the performance.

// Use hystrix for internal performance metrics

// Scenarios:

//  Single service and single service instance:
//   a service  - a service instance (an organization and a space) - simultaneous usage submissions based on the input parameter
//   a service  - a service instance (an organization and a space) - sequential usage submissions based on the input parameter

// Logistical constraints:
//  Remote PouchDB requires existing set of partitioned databases.

const _ = require('underscore');

const request = require('cf-abacus-request');

// Setup the debug log
const debug = require('cf-abacus-debug')('cf-abacus-test-perf');

const map = _.map;
const range = _.range;

// Take number of submissions as first parameter
const submissions = parseInt(process.argv[2]) || 1;

// Take a delta time as second parameter
const delta = parseInt(process.argv[3]) || 0;

describe('cf-abacus-test-perf', () => {
    it('Simultaneous usage submissions for a service and a service instance and measure the performance', (done) => {
        // Set the timeout based on the # of submissions -  60 secs for submissions less than 100 and increase the timeout proportionally after that
        this.timeout(submissions > 100 ? 60000 * submissions / 100 : 60000);

        // Return a usage with unique start and end time based on a number
        const usage = (n) => ({ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1435629365220 + n + delta,
            end: 1435629465220 + n + delta, region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            plan_id: 'plan_123', resources: [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }]
        });

        // Complete the test only  after we get the responses for all submissions
        const cb = (function() {
            let cbs = 0;
            return () => { if (++cbs === submissions) done(); };
        })();

        // Simultaneous usage submission based on # of submissions
        map(range(submissions), (n) => {
            debug('Submission #%o', n + 1);
            request.post('http://localhost:9080/v1/metering/services/storage/usage', { body: usage(n) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);
                debug('Completed submission #%o', n + 1);
                cb();
            });
        });
    });

    it('Sequential usage submissions for a service and a service instance and measure the performance', (done) => {
        // Set the timeout based on the # of submissions -  60 secs for submissions less than 100 and increase the timeout proportionally after that
        this.timeout(submissions > 100 ? 60000 * submissions / 100 : 60000);

        // Return a usage with unique start and end time based on a number
        const usage = (n) => ({ service_instances: [{ service_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87', usage: [{ start: 1445629365220 + n + delta,
            end: 1445629465220 + n + delta, region: 'eu-gb', organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', space_guid: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            plan_id: 'plan_123', resources: [{ unit: 'BYTE', quantity: 1073741824 }, { unit: 'LIGHT_API_CALL', quantity: 1000 }, { unit: 'HEAVY_API_CALL', quantity: 100 }] }] }]
        });

        // Submit nth usage
        const submit = (n, cb) => {
            debug('Submission #%o', n + 1);
            request.post('http://localhost:9080/v1/metering/services/storage/usage', { body: usage(n) }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(201);
                debug('Completed submission #%o', n + 1);
                cb();
            });
        };

        // Submit next usage till we reach the # of submissions and complete the test after reaching the end.
        const cb = (function() {
            let cbs = 0;
            return () => ++cbs === submissions ? done() : submit(cbs, cb);
        })();

	// Go through usage submissions one by one starting from the first.
        submit(0, cb);
    });
});
