'use strict';

// The data schemas we use to validate usage data and resource definitions.

const schemas = require('..');

describe('abacus-metering-schemas', () => {
  describe('validate schema for a metering plan', () => {
    it('validates a valid metering plan', () => {
      const def = {
        plan_id: 'basic',
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
          type: 'discrete',
          meter: '(m) => m.STORAGE / 1073741824'
        },
          {
            name: 'thousand_light_api_calls',
            unit: 'THOUSAND_CALLS',
            type: 'discrete',
            meter: '(m) => m.light_api_calls / 1000'
          },
          {
            name: 'heavy_api_calls',
            unit: 'CALL',
            type: 'discrete',
            meter: '(m) => m.heavy_api_calls',
            accumulate: '(a, qty) => a ? a + qty : qty',
            aggregate: '(a, qty) => a ? a + qty : qty',
            summarize: '(t, qty) => qty'
          }]
      };

      expect(schemas.meteringPlan.validate(def)).to.equal(def);
    });

    it('reports an invalid metering plan', () => {
      const def = {
        id: 'test',
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
          type: 'discrete',
          meter: '(m) => m.storage / 1073741824'
        },
          {
            unit: 'THOUSAND_CALLS',
            type: 'discrete',
            meter: '(m) => m.light_api_calls / 1000'
          },
          {
            name: 'heavy_api_calls',
            type: 'discrete',
            meter: '(m) => m.heavy_api_calls',
            accumulate: '(a, qty) => a ? a + qty : qty',
            aggregate: '(a, qty) => a ? a + qty : qty'
          }]
      };

      let result, error;
      try {
        result = schemas.meteringPlan.validate(def);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          type: 'object',
          field: 'data.plan_id',
          message: 'is required',
          value: def
        },
        {
          type: 'object',
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        },
        {
          type: 'object',
          field: 'data.measures.0.name',
          message: 'is required',
          value: def.measures[0]
        },
        {
          type: 'object',
          field: 'data.measures.1.unit',
          message: 'is required',
          value: def.measures[1]
        },
        {
          type: 'object',
          field: 'data.metrics.1.name',
          message: 'is required',
          value: def.metrics[1]
        },
        {
          type: 'object',
          field: 'data.metrics.2.unit',
          message: 'is required',
          value: def.metrics[2]
        }]
      });
    });

    it('reports an invalid metering plan with missing metric type', () => {
      const def = {
        id: 'test',
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
          type: 'discrete',
          meter: '(m) => m.storage / 1073741824'
        },
          {
            name: 'thousand_light_api_calls',
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
        result = schemas.meteringPlan.validate(def);
      }
      catch (e) {
        error = e;
      }

      expect(result).to.equal(undefined);
      expect(error).to.deep.equal({
        statusCode: 400,
        message: [{
          field: 'data.plan_id',
          message: 'is required',
          value: def,
          type: 'object'
        },
        {
          field: 'data',
          message: 'has additional properties',
          value: 'data.id',
          type: 'object'
        },
        {
          field: 'data.measures.0.name',
          message: 'is required',
          value: def.measures[0],
          type: 'object'
        },
        {
          field: 'data.measures.1.unit',
          message: 'is required',
          value: def.measures[1],
          type: 'object'
        },
        {
          field: 'data.metrics.1.type',
          message: 'is required',
          value: def.metrics[1],
          type: 'object'
        },
        {
          field: 'data.metrics.2.unit',
          message: 'is required',
          value: def.metrics[2],
          type: 'object'
        },
        {
          field: 'data.metrics.2.type',
          message: 'is required',
          value: def.metrics[2],
          type: 'object'
        }]
      });
    });
  });

  describe('validate resource usage', () => {
    it('validates a valid resource usage', () => {
      const usage = {
        start: 1420243200000,
        end: 1420245000000,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'test-resource',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        measured_usage: [{
          measure: 'light_api_calls',
          quantity: 12
        }]
      };

      expect(schemas.resourceUsage.validate(usage)).to.equal(usage);
    });

    it('reports an invalid resource usage', () => {
      const usage = {
        id: '123',
        start: 1420243200000,
        end: 1420245000000,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'test-resource',
        plan_id: 'basic',
        measured_usage: [{
          measure: 'light_api_calls',
          quantity: 12
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
          type: 'object',
          field: 'data.resource_instance_id',
          message: 'is required',
          value: usage
        },
        {
          type: 'object',
          field: 'data',
          message: 'has additional properties',
          value: 'data.id'
        }]
      });
    });
  });

  describe('validate schema for a rating plan', () => {
    it('validates a valid rating plan', () => {
      const def = {
        plan_id: 'test-rating-plan',
        metrics: [{
          name: 'storage'
        }, {
          name: 'thousand_light_api_calls'
        }, {
          name: 'heavy_api_calls',
          rate: '(p, qty) => p ? p * qty : 0',
          charge: '(t, cost) => cost'
        }]
      };
      expect(schemas.ratingPlan.validate(def)).to.equal(def);
    });

    it('reports an invalid rating plan', () => {
      const def = {
        id: 'test-rating-plan',
        metrics: [{
          name: 'storage'
        }, {
          unit: 'THOUSAND_CALLS'
        }, {
          name: 'heavy_api_calls',
          meter: '(m) => m.heavy_api_calls'
        }]
      };

      try {
        schemas.ratingPlan.validate(def);
        expect(schemas.ratingPlan.validate(def)).to.throw();
      }
      catch (e) {
        expect(e).to.deep.equal({
          statusCode: 400,
          message: [{
            type: 'object',
            field: 'data.plan_id',
            message: 'is required',
            value: def
          }, {
            type: 'object',
            field: 'data',
            message: 'has additional properties',
            value: 'data.id'
          }, {
            type: 'object',
            field: 'data.metrics.1.name',
            message: 'is required',
            value: def.metrics[1]
          }, {
            type: 'object',
            field: 'data.metrics.1',
            message: 'has additional properties',
            value: 'data.metrics[j].unit'
          }, {
            type: 'object',
            field: 'data.metrics.2',
            message: 'has additional properties',
            value: 'data.metrics[j].meter'
          }]
        });
      }
    });
  });

  describe('validate schema for a pricing plan', () => {
    it('validates a valid pricing plan', () => {
      const def = {
        plan_id: 'test-pricing-plan',
        metrics: [
          {
            name: 'storage',
            prices: [
              {
                country: 'USA',
                price: 1.1
              },
              {
                country: 'EUR',
                price: 2.2
              },
              {
                country: 'CAN',
                price: 3.3
              }]
          }]
      };
      expect(schemas.pricingPlan.validate(def)).to.equal(def);
    });

    it('reports an invalid pricing plan', () => {
      const def = {
        id: 'test-pricing-plan',
        metrics: [{
          name: 'storage'
        }, {
          prices: 'wrong type'
        }, {
          name: 'heavy_api_calls',
          prices: [{
            country: 'USA'
          }, {
            country: 'EUR',
            price: 2.0
          }]
        }]
      };

      try {
        schemas.pricingPlan.validate(def);
        expect(schemas.pricingPlan.validate(def)).to.throw();
      }
      catch (e) {
        expect(e).to.deep.equal({
          statusCode: 400,
          message: [{
            type: 'object',
            field: 'data.plan_id',
            message: 'is required',
            value: def
          }, {
            type: 'object',
            field: 'data',
            message: 'has additional properties',
            value: 'data.id'
          }, {
            type: 'object',
            field: 'data.metrics.0.prices',
            message: 'is required',
            value: def.metrics[0]
          }, {
            type: 'object',
            field: 'data.metrics.1.name',
            message: 'is required',
            value: def.metrics[1]
          }, {
            type: 'array',
            field: 'data.metrics.1.prices',
            message: 'is the wrong type',
            value: def.metrics[1].prices
          }, {
            type: 'object',
            field: 'data.metrics.2.prices.0.price',
            message: 'is required',
            value: def.metrics[2].prices[0]
          }]
        });
      }
    });
  });
});

