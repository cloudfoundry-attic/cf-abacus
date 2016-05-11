'use strict';

// A sample analytics resource metering plan that uses metering formulas

// Formulas are deprecated, we're now using meter, accumulate, aggregate
// and rate Javascript functions instead

/* istanbul ignore file */

module.exports = {
  plan_id: 'basic-analytics',
  measures: [
    {
      name: 'classifiers',
      unit: 'INSTANCE'
    },
    {
      name: 'classifier_api_calls',
      unit: 'CALL'
    },
    {
      name: 'training_event_api_calls',
      unit: 'CALL'
    }],
  metrics: [
    {
      name: 'classifier_instances',
      unit: 'INSTANCE',
      type: 'discrete',
      formula: 'AVG({classifier})'
    },
    {
      name: 'classifier_api_calls',
      unit: 'CALL',
      type: 'discrete',
      formula: 'SUM({classifier_api.calls})'
    },
    {
      name: 'training_event_api_calls',
      unit: 'CALL',
      type: 'discrete',
      formula: 'SUM({training_event_api_calls})'
    }]
};

