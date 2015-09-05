'use strict';

// A sample analytics service that uses metering formulas

// Formulas are deprecated, we're now using meter, accumulate, aggregate
// and rate Javascript functions instead

module.exports = {
  resource_id: 'analytics',
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
      formula: 'AVG({classifier})'
    },
    {
      name: 'classifier_api_calls',
      unit: 'CALL',
      formula: 'SUM({classifier_api.calls})'
    },
    {
      name: 'training_event_api_calls',
      unit: 'CALL',
      formula: 'SUM({training_event_api_calls})'
    }]
};

