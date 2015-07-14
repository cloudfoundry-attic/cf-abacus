'use strict';

// Usage rating service

const proxyquire = require('proxyquire');

// Mock the cluster and request modules
const clustmock = (app) => app;
const webapp = proxyquire('cf-abacus-webapp', { 'cf-abacus-cluster': clustmock });

const rateapp = proxyquire('..', { 'cf-abacus-webapp': webapp});

describe('cf-abacus-usage-rate', () => {
    describe('validate usage rating', () => {
        it('rate a usage', () => {
            const u = { organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
                consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }] }] }] };

            rateapp.rate(u);

            expect(u).to.deep.equal({ organization_guid: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', services: [{ id: 'storage', plan_id: 'basic', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1, cost: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3, cost: 0.09 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300, cost: 45 }] }],
                spaces: [{ id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a', services: [{ id: 'storage', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }],
                consumers: [{ id: 'all', services: [{ id: 'storage', aggregated_usage:
                [{ unit: 'STORAGE_PER_MONTH', quantity: 1 }, { unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', quantity: 3 }, { unit: 'HEAVY_API_CALLS_PER_MONTH', quantity: 300 }] }] }] }] });
        });
    });
});
