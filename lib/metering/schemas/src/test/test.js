'use strict';

// The JSON schemas we use to validate usage data and service definitions.

const schemas = require('..');

describe('cf-abacus-metering-schemas', () => {
    describe('validate schema for a service resource definition', () => {
        it('validate a valid schema', () => {
            const service = { id: 'service-1',
                resources:[{ name: 'Storage', units: [{ 'name': 'BYTE', quantityType: 'CURRENT' }] },
                    { name: 'LightApiCalls', units: [{ name: 'LIGHT_API_CALL', quantityType: 'DELTA' }] },
                    { name: 'HeavyApiCalls', units: [{ name: 'HEAVY_API_CALL', quantityType: 'DELTA' }] }],
                aggregations:[{ id: 'STORAGE_PER_MONTH', unit: 'GIGABYTE', aggregationGroup: { name: 'monthly'}, formula: 'MAX({BYTE}/1073741824)' },
                    { id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH', unit: 'LIGHT_API_CALL', aggregationGroup: { name: 'monthly' }, formula: (r) => r.LIGHT_API_CALL / 1000 },
                    { id: 'HEAVY_API_CALLS_PER_MONTH', unit: 'HEAVY_API_CALL', aggregationGroup: { name: 'monthly' }, formula: 'SUM({HEAVY_API_CALL})',
                     accumulate: (a, qty) => a ? a + qty : qty, aggregate: (a, qty) => a ? a + qty : qty }]
            };

            expect(schemas.serviceDefinition.validate(service)).to.equal(service);
        });
    });

    describe('validate usage submission schema for a service', () => {
        it('validate a valid usage record', () => {
            const usage = { service_instances: [{ service_instance_id: '123', usage: [{ start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', organization_guid: 'org_456',
                space_guid: 'space_567', consumer: { type: 'external', value: '123' }, resources: [{ unit: 'calls', quantity: 12 }] }] }]
            };

            expect(schemas.serviceUsage.validate(usage)).to.equal(usage);
        });
    });

    describe('validate usage submission schema for a service instance', () => {
        it('validate a valid usage record', () => {
            const usage = { service_id: '123', usage: [{ start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', organization_guid: 'org_456', space_guid: 'space_567',
                consumer: { type: 'external', value: '123' }, resources: [{ unit: 'calls', quantity: 12 }] }]
            };
            expect(schemas.serviceInstanceUsage.validate(usage)).to.equal(usage);
        });
    });

    describe('validate usage submission schema for a runtime', () => {
        it('validate a valid usage record', () => {
            const usage = { usage: [{ start: 1420243200000, end: 1420245000000, plan_id: 'plan_123', organization_guid: 'org_456', space_guid: 'space_567',
                consumer: { value: '123' }, resources: [{ unit: 'calls', quantity: 12 }] }]
            };

            expect(schemas.runtimeUsage.validate(usage)).to.equal(usage);
        });

        it('validate an invalid usage record', () => {
            const usage = { usage: [{ tart: 1420243200000, end: 1420245000000, plan_id: 'plan_123', organization_guid: 'org_456', space_guid: 'space_567',
                consumer: { value: '123' }, resources: [{ unit: 'calls', quantity: 12 }] }]
            };

            try {
                schemas.runtimeUsage.validate(usage);
            }
            catch(error) {
                expect(error.statusCode).to.equal(400);

                // Remove statusCode property from error, so that we can explicitly compare the error details
                delete error.statusCode;

                expect(error).to.deep.equal([{ field: 'data.usage.0.start', message: 'is required', value: usage.usage[0] },
                    { field: 'data.usage.0', message: 'has additional properties', value: 'data.usage[i].tart' }
                ]);
            }
        });
    });
});
