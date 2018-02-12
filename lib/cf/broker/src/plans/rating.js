'use strict';

const defaultMetrics = [
  {
    name: 'sampleName'
  }
];

module.exports = (planId = '', metrics = defaultMetrics) => ({
  plan_id: planId,
  metrics: metrics
});
