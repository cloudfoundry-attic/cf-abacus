'use strict';

const defaultMetrics = [
  {
    name: 'sampleName',
    prices: [
      {
        country: 'sampleCountry',
        price: 0
      }
    ]
  }
];

module.exports = (planId = '', metrics = defaultMetrics) => ({
  plan_id: planId,
  metrics: metrics
});
