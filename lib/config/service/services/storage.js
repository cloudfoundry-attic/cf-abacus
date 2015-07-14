'use strict';

module.exports = {
    id: 'storage',
    resources: [
        {
            name: 'Storage',
            units: [
                {
                    name: 'BYTE',
                    quantityType: 'CURRENT'
                }
            ]
        },
        {
            name: 'LightApiCalls',
            units: [
                {
                    name: 'LIGHT_API_CALL',
                    quantityType: 'DELTA'
                }
            ]
        },
        {
            name: 'HeavyApiCalls',
            units: [
                {
                    name: 'HEAVY_API_CALL',
                    quantityType: 'DELTA'
                }
            ]
        }
    ],
    aggregations: [
        {
            id: 'STORAGE_PER_MONTH',
            unit: 'GIGABYTE',
            aggregationGroup: {
                name: 'monthly'
            },
            formula: 'MAX({BYTE}/1073741824)',
            rate: (p, qty) => p ? p * qty : 0
        },
        {
            id: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
            unit: 'LIGHT_API_CALL',
            aggregationGroup: {
                name: 'monthly'
            },
            formula: (r) => r.LIGHT_API_CALL / 1000,
            accumulate: (a, qty) => a ? a + qty : qty,
            aggregate: (a, qty) => a ? a + qty : qty,
            rate: (p, qty) => p ? p * qty : 0
        },
        {
            id: 'HEAVY_API_CALLS_PER_MONTH',
            unit: 'HEAVY_API_CALL',
            aggregationGroup: {
                name: 'monthly'
            },
            formula: 'SUM({HEAVY_API_CALL})',
            rate: (p, qty) => p ? p * qty : 0
        }
    ]
};
