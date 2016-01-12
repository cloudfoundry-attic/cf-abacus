'use strict';

// The data schemas we use to validate usage data and resource definitions.

const schemas = require('..');

describe('abacus-metering-schemas', () => {
  describe('validate schema for a resource definition', () => {
    it('validates a valid resource definition', () => {
      const def = {
        resource_id: 'test-resource',
        effective: 1420070400000,
        plans: [{
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
              aggregate: '(a, qty) => a ? a + qty : qty',
              rate: '(p, qty) => p ? p * qty : 0',
              summarize: '(t, qty) => qty',
              charge: '(t, cost) => cost'
            }]
        }]
      };

      expect(schemas.resourceConfig.validate(def)).to.equal(def);
    });

    it('validates a valid metering config', () => {
      const def = {
        resource_id: 'test-resource',
        effective: 1420070400000,
        metering_plans: [{
          metering_plan_id: 'basic',
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
              aggregate: '(a, qty) => a ? a + qty : qty',
              summarize: '(t, qty) => qty'
            }]
        }]
      };

      expect(schemas.meteringConfig.validate(def)).to.equal(def);
    });

    it('validates a valid rating config', () => {
      const def = {
        resource_id: 'test-resource',
        effective: 1420070400000,
        rating_plans: [{
          rating_plan_id: 'basic',
          metrics: [{
            name: 'storage',
            unit: 'GIGABYTE'
          },
            {
              name: 'thousand_light_api_calls',
              unit: 'THOUSAND_CALLS'
            },
            {
              name: 'heavy_api_calls',
              unit: 'CALL',
              rate: '(p, qty) => p ? p * qty : 0',
              charge: '(t, cost) => cost'
            }]
        }]
      };

      expect(schemas.ratingConfig.validate(def)).to.equal(def);
    });

    it('reports an invalid resource definition', () => {
      const def = {
        id: 'test-resource',
        effective: 1420070400000,
        plans: [{
          plan_id: 'test',
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
        }]
      };

      let result, error;
      try {
        result = schemas.resourceConfig.validate(def);
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
          field: 'data.plans.0.measures.0.name',
          message: 'is required',
          value: def.plans[0].measures[0]
        },
        {
          field: 'data.plans.0.measures.1.unit',
          message: 'is required',
          value: def.plans[0].measures[1]
        },
        {
          field: 'data.plans.0.metrics.1.name',
          message: 'is required',
          value: def.plans[0].metrics[1]
        },
        {
          field: 'data.plans.0.metrics.2.unit',
          message: 'is required',
          value: def.plans[0].metrics[2]
        }]
      });
    });

    it('reports an invalid metering config', () => {
      const def = {
        id: 'test-resource',
        effective: 1420070400000,
        metering_plans: [{
          metering_plan_id: 'test',
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
        }]
      };

      let result, error;
      try {
        result = schemas.meteringConfig.validate(def);
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
          field: 'data.metering_plans.0.measures.0.name',
          message: 'is required',
          value: def.metering_plans[0].measures[0]
        },
        {
          field: 'data.metering_plans.0.measures.1.unit',
          message: 'is required',
          value: def.metering_plans[0].measures[1]
        },
        {
          field: 'data.metering_plans.0.metrics.1.name',
          message: 'is required',
          value: def.metering_plans[0].metrics[1]
        },
        {
          field: 'data.metering_plans.0.metrics.2.unit',
          message: 'is required',
          value: def.metering_plans[0].metrics[2]
        }]
      });
    });

    it('reports an invalid rating config', () => {
      const def = {
        id: 'test-resource',
        effective: 1420070400000,
        rating_plans: [{
          rating_plan_id: 'test',
          metrics: [{
            name: 'storage',
            unit: 'GIGABYTE'
          },
            {
              unit: 'THOUSAND_CALLS'
            },
            {
              name: 'heavy_api_calls',
              meter: '(m) => m.heavy_api_calls'
            }]
        }]
      };

      let result, error;
      try {
        result = schemas.ratingConfig.validate(def);
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
          field: 'data.rating_plans.0.metrics.1.name',
          message: 'is required',
          value: def.rating_plans[0].metrics[1]
        },
        {
          field: 'data.rating_plans.0.metrics.2.unit',
          message: 'is required',
          value: def.rating_plans[0].metrics[2]
        },
        {
          field: 'data.rating_plans.0.metrics.2',
          message: 'has additional properties',
          value: 'data.rating_plans[j].metrics[l].meter'
        }]
      });
    });
  });

  describe('validate resource usage', () => {
    it('validates a valid resource usage', () => {
      const usage = {
        usage: [{
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
        }]
      };

      expect(schemas.resourceUsage.validate(usage)).to.equal(usage);
    });

    it('reports an invalid resource usage', () => {
      const usage = {
        id: '123',
        usage: [{
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
        }]
      });
    });
  });
});

