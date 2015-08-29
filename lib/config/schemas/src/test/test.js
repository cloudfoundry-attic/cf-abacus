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
      const def = {
        resource_id: 'storage',
        measures: [{
            name: 'storage',
            unit: 'BYTE'
          },
          {
            name: 'light_api_calls',
            unit: 'CALL'
          },
          {
            name: 'heavy_api_calls',
            unit: 'CALL'
          }],
        metrics: [{
            name: 'storage',
            unit: 'GIGABYTE',
            meter: '(m) => m.STORAGE / 1073741824'
          },
          {
            name: 'thousand_light_api_calls',
            unit: 'THOUSAND_CALLS',
            meter: '(m) => m.light_api_calls / 1000'
          },
          {
            name: 'heavy_api_calls',
            unit: 'CALL',
            meter: '(m) => m.heavy_api_calls',
            accumulate: '(a, qty) => a ? a + qty : qty',
            aggregate: '(a, qty) => a ? a + qty : qty'
          }]
      };

      expect(schemas.resourceDefinition.validate(def)).to.equal(def);
    });

    it('validates an invalid resource definition', () => {
      const def = {
        id: 'storage',
        measures: [{
          unit: 'BYTE'
        },
        {
          name: 'light_api_calls'
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL'
        }],
        metrics: [{
          name: 'storage',
          unit: 'GIGABYTE',
          meter: '(m) => m.storage / 1073741824'
        },
        {
          unit: 'THOUSAND_CALLS',
          meter: '(m) => m.light_api_calls / 1000'
        },
        {
          name: 'heavy_api_calls',
          meter: '(m) => m.heavy_api_calls',
          accumulate: '(a, qty) => a ? a + qty : qty',
          aggregate: '(a, qty) => a ? a + qty : qty'
        }]
      };

      let result, error;
      try {
        result = schemas.resourceDefinition.validate(def);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data.resource_id',
          message: 'is required',
          value: def
        },
        {
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        },
        {
          field: 'data.measures.0.name',
          message: 'is required',
          value: def.measures[0]
        },
        {
          field: 'data.measures.1.unit',
          message: 'is required',
          value: def.measures[1]
        },
        {
          field: 'data.metrics.1.name',
          message: 'is required',
          value: def.metrics[1]
        },
        {
          field: 'data.metrics.2.unit',
          message: 'is required',
          value: def.metrics[2]
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
          measured_usage: [{
            measure: 'light_api_calls',
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
          measured_usage: [{
            measure: 'light_api_calls',
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
          measured_usage: [{
            measure: 'light_api_calls',
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

