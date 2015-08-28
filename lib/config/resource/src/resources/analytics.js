'use strict';

module.exports = {
  id: 'analytics',
  metrics: [
    {
      name: 'Classifier',
      units: [
        {
          name: 'INSTANCE',
          quantityType: 'CURRENT'
        }]
    },
    {
      name: 'ClassifierApi',
      units: [
        {
          name: 'API_CALL',
          quantityType: 'DELTA'
        }]
    },
    {
      name: 'TrainingEventApi',
      units: [
        {
          name: 'API_CALL',
          quantityType: 'DELTA'
        }]
    }],
  transforms: [
    {
      id: 'CLASSIFIER_INSTANCES_PER_MONTH',
      unit: 'INSTANCE',
      aggregationGroup: {
        name: 'MONTHLY'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'AVG({Classifier.INSTANCE})'
    },
    {
      id: 'CLASSIFIER_API_CALLS_PER_MONTH',
      unit: 'API_CALL',
      aggregationGroup: {
        name: 'MONTHLY'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'SUM({ClassifierApi.API_CALL})'
    },
    {
      id: 'TRAINING_EVENT_API_CALLS_PER_MONTH',
      unit: 'API_CALL',
      aggregationGroup: {
        name: 'MONTHLY'
      },
      // Formulas are deprecated, we're now using meter, accumulate, aggregate
      // and rate Javascript functions instead
      formula: 'SUM({TrainingEventApi.API_CALL})'
    }]
};

