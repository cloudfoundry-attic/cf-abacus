'use strict';

// A sample analytics service

// Formulas are deprecated, we're now using meter, accumulate, aggregate
// and rate Javascript functions instead

/* istanbul ignore file */

module.exports = {
  rating_plan_id: 'analytics-rating-plan',
  effective: 1420070400000,
  metrics: [
    {
      name: 'classifier_instances'
    },
    {
      name: 'classifier_api_calls'
    },
    {
      name: 'training_event_api_calls'
    }
  ]
};
