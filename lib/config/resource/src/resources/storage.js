'use strict';

module.exports = {
  id: 'storage',
  metrics: [
    {
      name: 'Storage',
      units: [
        {
          name: 'BYTE',
          quantityType: 'CURRENT'
        }]
    },
    {
      name: 'LightApiCalls',
      units: [
        {
          name: 'LIGHT_API_CALL',
          quantityType: 'DELTA'
        }]
    },
    {
      name: 'HeavyApiCalls',
      units: [
        {
          name: 'HEAVY_API_CALL',
          quantityType: 'DELTA'
        }]
    }],
  transforms: [
    {
      id: 'STORAGE_PER_MONTH',
      unit: 'GIGABYTE',
      aggregationGroup: {
        name: 'monthly'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'MAX({BYTE}/1073741824)',
      rate: 'function(p, qty) { return p ? p * qty : 0; }'
    },
    {
      id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
      unit: 'LIGHT_API_CALL',
      aggregationGroup: {
        name: 'monthly'
      },
      meter: 'function(r) { return r.LIGHT_API_CALL / 1000; }',
      accumulate: 'function(a, qty) { return a ? a + qty : qty; }',
      aggregate: 'function(a, qty) { return a ? a + qty : qty; }',
      rate: 'function(p, qty) { return p ? p * qty : 0; }'
    },
    {
      id: 'HEAVY_API_CALLS_PER_MONTH',
      unit: 'HEAVY_API_CALL',
      aggregationGroup: {
        name: 'monthly'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'SUM({HEAVY_API_CALL})',
      rate: 'function(p, qty) { return p ? p * qty : 0; }'
    }]
};

