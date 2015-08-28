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
        name: 'MONTHLY'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'MAX({BYTE}/1073741824)',
      rate: '(p, qty) => p ? p * qty : 0'
    },
    {
      id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
      unit: 'LIGHT_API_CALL',
      aggregationGroup: {
        name: 'MONTHLY'
      },
      meter: '(m) => m.LIGHT_API_CALL / 1000',
      accumulate: '(a, qty) => a ? a + qty : qty',
      aggregate: '(a, qty) => a ? a + qty : qty',
      rate: '(p, qty) => p ? p * qty : 0'
    },
    {
      id: 'HEAVY_API_CALLS_PER_MONTH',
      unit: 'HEAVY_API_CALL',
      aggregationGroup: {
        name: 'MONTHLY'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'SUM({HEAVY_API_CALL})',
      rate: '(p, qty) => p ? p * qty : 0'
    }]
};

