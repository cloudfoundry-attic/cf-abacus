'use strict';

// A sample analytics service

// Formulas are deprecated, we're now using meter, accumulate, aggregate
// and rate Javascript functions instead

/* istanbul ignore file */

module.exports = {
  resource_id: 'analytics',
  effective: 1420070400000,
  rating_plans: [
    {
      rating_plan_id: 'basic',
      metrics: [
        {
          name: 'classifier_instances',
          unit: 'INSTANCE'
        },
        {
          name: 'classifier_api_calls',
          unit: 'CALL'
        },
        {
          name: 'training_event_api_calls',
          unit: 'CALL'
        }]
    }
  ]
};

