'use strict';

// The data schemas we use to validate usage data and resource definitions.

// Mock resources from abacus-resource-config module
require('abacus-resource-config');
require.cache[require.resolve('abacus-resource-config')].exports.all = () => ({
  valid_resource_id: ''
});

const schemas = require('..');

describe('abacus-metering-schemas', () => {
  describe('validate schema for a resource definition', () => {
    it('validates a valid resource definition', () => {
      const resource = {
        id: 'resource-1',
        metrics: [{
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
        transforms: [{
          id: 'STORAGE_PER_MONTH',
          unit: 'GIGABYTE',
          aggregationGroup: {
            name: 'MONTHLY'
          },
          meter: 'MAX({BYTE}/1073741824)'
        },
          {
            id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
            unit: 'LIGHT_API_CALL',
            aggregationGroup: {
              name: 'MONTHLY'
            },
            meter: '(r) => r.LIGHT_API_CALL / 1000'
          },
          {
            id: 'HEAVY_API_CALLS_PER_MONTH',
            unit: 'HEAVY_API_CALL',
            aggregationGroup: {
              name: 'MONTHLY'
            },
            meter: 'SUM({HEAVY_API_CALL})',
            accumulate: '(a, qty) => a ? a + qty : qty',
            aggregate: '(a, qty) => a ? a + qty : qty'
          }]
      };

      expect(schemas.resourceDefinition.validate(resource)).to.equal(resource);
    });

    it('validates an invalid resource definition', () => {
      const resource = {
        resource_id: 'resource-1',
        metrics: [{
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
        transforms: [{
          id: 'STORAGE_PER_MONTH',
          unit: 'GIGABYTE',
          aggregationGroup: {
            name: 'invalid'
          },
          meter: 'MAX({BYTE}/1073741824)'
        },
          {
            unit: 'LIGHT_API_CALL',
            aggregationGroup: {
              name: 'MONTHLY'
            }
          },
          {
            id: 'HEAVY_API_CALLS_PER_MONTH',
            aggregationGroup: {
              name: 'MONTHLY'
            },
            meter: 'SUM({HEAVY_API_CALL})',
            accumulate: '(a, qty) => a ? a + qty : qty',
            aggregate: '(a, qty) => a ? a + qty : qty'
          }]
      };

      let result, error;
      try {
        result = schemas.resourceDefinition.validate(resource);
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
          value: resource
        },
          {
            field: 'data',
            message: 'has additional properties',
            value: 'data.resource_id'
          },
          {
            field: 'data.metrics.0.units.0.quantityType',
            message: 'must be an enum value',
            value: 'INVALID'
          },
          {
            field: 'data.metrics.2.units.0.name',
            message: 'is required',
            value: resource.metrics[2].units[0]
          },
          {
            field: 'data.transforms.0.aggregationGroup.name',
            message: 'must be an enum value',
            value: 'invalid'
          },
          {
            field: 'data.transforms.1.id',
            message: 'is required',
            value: resource.transforms[1]
          },
          {
            field: 'data.transforms.2.unit',
            message: 'is required',
            value: resource.transforms[2]
          }]
      });
    });
  });

  describe('validate resource usage', () => {
    it('validates valid resource usage', () => {
      const usage = {
        usage: [{
          start: 1420243200000,
          end: 1420245000000,
          organization_id: 'org_456',
          space_id: 'space_567',
          consumer: {
            type: 'EXTERNAL',
            consumer_id: '123'
          },
          resource_id: 'valid_resource_id',
          plan_id: 'plan_123',
          resource_instance_id: '123',
          metrics: [{
            unit: 'calls',
            quantity: 12
          }]
        }]
      };

      expect(schemas.resourceUsage.validate(usage)).to.equal(usage);
    });

    it('validates resource usage with invalid consumer type', () => {
      const usage = {
        id: '123',
        usage: [{
          start: 1420243200000,
          end: 1420245000000,
          organization_id: 'org_456',
          space_id: 'space_567',
          consumer: {
            type: 'invalid',
            consumer_id: '123'
          },
          resource_id: 'valid_resource_id',
          plan_id: 'plan_123',
          metrics: [{
            quantity: 12
          }]
        }]
      };

      let result, error;

      try {
        result = schemas.resourceUsage.validate(usage);
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
            field: 'data.usage.0.resource_instance_id',
            message: 'is required',
            value: usage.usage[0]
          },
          {
            field: 'data.usage.0.consumer.type',
            message: 'must be an enum value',
            value: 'invalid'
          },
          {
            field: 'data.usage.0.metrics.0.unit',
            message: 'is required',
            value: usage.usage[0].metrics[0]
          }]
      });
    });

    it('validates resource usage with invalid resource id', () => {
      const usage = {
        usage: [{
          start: 1420243200000,
          end: 1420245000000,
          organization_id: 'org_456',
          space_id: 'space_567',
          consumer: {
            type: 'EXTERNAL',
            consumer_id: '123'
          },
          resource_id: 'invalid_resource_id',
          plan_id: 'plan_123',
          resource_instance_id: '123',
          metrics: [{
            unit: 'calls',
            quantity: 12
          }]
        }]
      };

      let result, error;

      try {
        result = schemas.resourceUsage.validate(usage);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
          message: [{
            field: 'data.usage.0.resource_id',
            message: 'must be an enum value',
            value: 'invalid_resource_id'
          }]
      });
    });
  });
});

