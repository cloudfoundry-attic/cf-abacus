'use strict';

module.exports = {
  resource_id: 'object-storage',
  measures: [
    {
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
  metrics: [
    {
      name: 'storage',
      unit: 'GIGABYTE',
      meter: '(m) => m.storage / 1073741824',
      accumulate: '(a, qty) => Math.max(a, qty)',
      rate: '(price, qty) => price ? price * qty : 0'
    },
    {
      name: 'thousand_light_api_calls',
      unit: 'THOUSAND_CALLS',
      meter: '(m) => m.light_api_calls / 1000',
      accumulate: '(a, qty) => a ? a + qty : qty',
      aggregate: '(a, qty) => a ? a + qty : qty',
      rate: '(p, qty) => p ? p * qty : 0'
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL',
      meter: '(m) => m.heavy_api_calls',
      rate: '(p, qty) => p ? p * qty : 0'
    }]
};

