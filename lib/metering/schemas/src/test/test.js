'use strict';

// The JSON schemas we use to validate usage data and service definitions.

const schemas = require('..');

describe('abacus-metering-schemas', () => {
  describe('validate schema for a service resource definition', () => {
    it('validate a valid schema', () => {
      const service = {
        id: 'service-1',
        resources: [{
          name: 'Storage',
          units: [{
            'name': 'BYTE',
            quantityType: 'CURRENT'
          }]
        },
        {
          name: 'LightApiCalls',
          units: [{
            name: 'LIGHT_API_CALL',
            quantityType: 'DELTA'
          }]
        },
        {
          name: 'HeavyApiCalls',
          units: [{
            name: 'HEAVY_API_CALL',
            quantityType: 'DELTA'
          }]
        }],
        aggregations: [{
          id: 'STORAGE_PER_MONTH',
          unit: 'GIGABYTE',
          aggregationGroup: {
            name: 'monthly'
          },
          formula: 'MAX({BYTE}/1073741824)'
        },
        {
          id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
          unit: 'LIGHT_API_CALL',
          aggregationGroup: {
            name: 'monthly'
          },
          formula: (r) => r.LIGHT_API_CALL / 1000
        },
        {
          id: 'HEAVY_API_CALLS_PER_MONTH',
          unit: 'HEAVY_API_CALL',
          aggregationGroup: {
            name: 'monthly'
          },
          formula: 'SUM({HEAVY_API_CALL})',
          accumulate: (a, qty) => a ? a + qty : qty,
          aggregate: (a, qty) => a ? a + qty : qty
        }]
      };

      expect(schemas.serviceDefinition.validate(service)).to.equal(
        service);
    });

    it('validate an invalid schema', () => {
      const service = {
        service_id: 'service-1',
        resources: [{
          name: 'Storage',
          units: [{
            'name': 'BYTE',
            quantityType: 'INVALID'
          }]
        },
        {
          units: [{
            name: 'LIGHT_API_CALL',
            quantityType: 'DELTA'
          }]
        },
        {
          name: 'HeavyApiCalls',
          units: [{
            quantityType: 'DELTA'
          }]
        }],
        aggregations: [{
          id: 'STORAGE_PER_MONTH',
          unit: 'GIGABYTE',
          aggregationGroup: {
            name: 'invalid'
          },
          formula: 'MAX({BYTE}/1073741824)'
        },
        {
          unit: 'LIGHT_API_CALL',
          aggregationGroup: {
            name: 'monthly'
          }
        },
        {
          id: 'HEAVY_API_CALLS_PER_MONTH',
          aggregationGroup: {
            name: 'monthly'
          },
          formula: 'SUM({HEAVY_API_CALL})',
          accumulate: (a, qty) => a ? a + qty : qty,
          aggregate: (a, qty) => a ? a + qty : qty
        }]
      };

      let result, error;

      try {
        result = schemas.serviceDefinition.validate(service);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data.id',
          message: 'is required',
          value: service
        },
        {
          field: 'data',
          message: 'has additional properties',
          value: 'data.service_id'
        },
        {
          field: 'data.resources.0.units.0.quantityType',
          message: 'must be an enum value',
          value: 'INVALID'
        },
        {
          field: 'data.resources.2.units.0.name',
          message: 'is required',
          value: service.resources[2].units[0]
        },
        {
          field: 'data.aggregations.0.aggregationGroup.name',
          message: 'must be an enum value',
          value: 'invalid'
        },
        {
          field: 'data.aggregations.1.id',
          message: 'is required',
          value: service.aggregations[1]
        },
        {
          field: 'data.aggregations.1.formula',
          message: 'is required',
          value: service.aggregations[1]
        },
        {
          field: 'data.aggregations.2.unit',
          message: 'is required',
          value: service.aggregations[2]
        }]
      });
    });
  });

  describe('validate usage submission schema for a service', () => {
    it('validate a valid usage record', () => {
      const usage = {
        service_instances: [{
          service_instance_id: '123',
          usage: [{
            start: 1420243200000,
            end: 1420245000000,
            plan_id: 'plan_123',
            organization_guid: 'org_456',
            space_guid: 'space_567',
            consumer: {
              type: 'external',
              value: '123'
            },
            resources: [{
              unit: 'calls',
              quantity: 12
            }]
          }]
        }]
      };

      expect(schemas.serviceUsage.validate(usage)).to.equal(usage);
    });

    it('validate an invalid usage record', () => {
      const usage = {
        id: '123',
        service_instances: [{
          usage: [{
            start: 1420243200000,
            end: 1420245000000,
            plan_id: 'plan_123',
            organization_guid: 'org_456',
            space_guid: 'space_567',
            consumer: {
              type: 'invalid',
              value: '123'
            },
            resources: [{
              quantity: 12
            }]
          }]
        }]
      };

      let result, error;

      try {
        result = schemas.serviceUsage.validate(usage);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        },
        {
          field: 'data.service_instances.0.service_instance_id',
          message: 'is required',
          value: usage.service_instances[0]
        },
        {
          field: 'data.service_instances.0.usage.0.consumer.type',
          message: 'must be an enum value',
          value: 'invalid'
        },
        {
          field: 'data.service_instances.0.usage.0.resources.0.unit',
          message: 'is required',
          value: usage.service_instances[0].usage[0].resources[
            0]
        }]
      });
    });
  });

  describe('validate usage submission schema for a service instance', () => {
    it('validate a valid usage record', () => {
      const usage = {
        service_id: '123',
        usage: [{
          start: 1420243200000,
          end: 1420245000000,
          plan_id: 'plan_123',
          organization_guid: 'org_456',
          space_guid: 'space_567',
          consumer: {
            type: 'external',
            value: '123'
          },
          resources: [{
            unit: 'calls',
            quantity: 12
          }]
        }]
      };
      expect(schemas.serviceInstanceUsage.validate(usage)).to.equal(
        usage);
    });

    it('validate an invalid usage record', () => {
      const usage = {
        id: '123',
        usage: [{
          start: '1420243200000',
          end: 1420245000000,
          plan_id: 'plan_123',
          organization_guid: 'org_456',
          space_guid: 'space_567',
          consumer: {
            type: 'external'
          },
          resources: [{
            unit: 'calls',
            quantity: '12'
          }]
        }]
      };

      let result, error;

      try {
        result = schemas.serviceInstanceUsage.validate(usage);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data.service_id',
          message: 'is required',
          value: usage
        },
        {
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        },
        {
          field: 'data.usage.0.start',
          message: 'is the wrong type',
          value: '1420243200000'
        },
        {
          field: 'data.usage.0.consumer.value',
          message: 'is required',
          value: usage.usage[0].consumer
        },
        {
          field: 'data.usage.0.resources.0.quantity',
          message: 'is the wrong type',
          value: '12'
        }]
      });
    });
  });

  describe('validate usage submission schema for a runtime', () => {
    it('validate a valid usage record', () => {
      const usage = {
        usage: [{
          start: 1420243200000,
          end: 1420245000000,
          plan_id: 'plan_123',
          organization_guid: 'org_456',
          space_guid: 'space_567',
          consumer: {
            value: '123'
          },
          resources: [{
            unit: 'calls',
            quantity: 12
          }]
        }]
      };

      expect(schemas.runtimeUsage.validate(usage)).to.equal(usage);
    });

    it('validate an invalid usage record', () => {
      const usage = {
        id: '123',
        usage: [{
          end: 1420245000000,
          plan_id: 'plan_123',
          organization_guid: 'org_456',
          space_guid: 'space_567',
          consumer: {
            value: '123'
          },
          resources: [{
            unit: 1,
            quantity: 12
          }]
        }]
      };

      let result, error;

      try {
        result = schemas.runtimeUsage.validate(usage);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        },
        {
          field: 'data.usage.0.start',
          message: 'is required',
          value: usage.usage[0]
        },
        {
          field: 'data.usage.0.resources.0.unit',
          message: 'is the wrong type',
          value: 1
        }]
      });
    });
  });
});
