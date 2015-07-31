'use strict';

// Usage rating service

const _ = require('underscore');
const cluster = require('cf-abacus-cluster');
const omit = _.omit;
const map = _.map;
const request = require('cf-abacus-request');

// Configure test db URL
process.env.COUCHDB = process.env.COUCHDB || 'test';

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('cf-abacus-cluster')].exports = extend((app) => app, cluster);

const rateapp = require('..');

describe('cf-abacus-usage-rate', () => {
    describe('validate usage rating', () => {
        it('rate a usage', function(done) {
            this.timeout(60000);

            // Create a test rate app
            const app = rateapp();

            // Listen on an ephemeral port
            const server = app.listen(0);

            // Describe a single aggregated usage object to be rated
            const usage = [{ organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', start: 1435968000000, end: 1436054400000,
                services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
                consumers: [{ id: 'all', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }] }] }] },
                { organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', start: 1436054400000, end: 1436140800000,
                services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 10 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000 }] }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 10 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000 }] }],
                consumers: [{ id: 'all', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 10 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000 }] }] }] }] }];

            // Post aggregated usage to rate
            let locations = {};
            const post = (done) => {
                let cbs = 0;
                const cb = () => { if(++cbs === usage.length) done(); };

                // Post the usage doc
                map(usage, (u) => request.post('http://localhost::p/v1/rating/usage', { p: server.address().port, body: u }, (err, val) => {
                    expect(err).to.equal(undefined);

                    // Expect a 201 to be return along with the location in the header
                    expect(val.statusCode).to.equal(201);
                    expect(val.headers.location).to.not.equal(undefined);

                    // Record the header location for retrieval later in the test
                    locations[u.id] = val.headers.location;
                    cb();
                }));
            };

            // Describe the expected rate usage at the end of the test
            const rated = [{ organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', start: 1435968000000, end: 1436054400000,
                services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 1, cost: 1 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3, cost: 0.09 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300, cost: 45 }]
                }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 1, cost: 1 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3, cost: 0.09 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300, cost: 45 }]
                }],
                consumers: [{ id: 'all', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 1, cost: 1 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3, cost: 0.09 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300, cost: 45 }]
                }] }] }] },
                { organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', start: 1436054400000, end: 1436140800000,
                services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 10, cost: 10 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4, cost: 0.12 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000, cost: 300 }]
                }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 10, cost: 10 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4, cost: 0.12 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000, cost: 300 }]
                }],
                consumers: [{ id: 'all', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                    [{ unit: 'STORAGE_PER_MONTH', quantity: 10, cost: 10 },
                    { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 4, cost: 0.12 },
                    { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 2000, cost: 300 }]
                }] }] }] }];

            // Get the rated usage
            const get = (done) => {
                let cbs = 0;
                const cb = () => { if(++cbs === usage.length) done(); };

                // Call a Get on the app
                map(usage, (u) => request.get(locations[u.id], {}, (err, val) => {
                    expect(err).to.equal(undefined);
                    expect(val.statusCode).to.equal(200);

                    // Expect our test aggregated values
                    if(val.body.end === 1436054400000) expect(omit(val.body, 'id')).to.deep.equal(rated[0]);
                    if(val.body.end === 1436140800000) expect(omit(val.body, 'id')).to.deep.equal(rated[1]);
                    cb();
                }));
            };

            // Run the above steps
            post(() => get(done));
        });
    });
});
