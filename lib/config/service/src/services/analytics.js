'use strict';

module.exports = {
  id: 'analytics',
  resources: [
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
  aggregations: [
    {
      id: 'CLASSIFIER_INSTANCES_PER_MONTH',
      unit: 'INSTANCE',
      aggregationGroup: {
        name: 'monthly'
      },
      formula: 'AVG({Classifier.INSTANCE})'
    },
    {
      id: 'CLASSIFIER_API_CALLS_PER_MONTH',
      unit: 'API_CALL',
      aggregationGroup: {
        name: 'monthly'
      },
      formula: 'SUM({ClassifierApi.API_CALL})'
    },
    {
      id: 'TRAINING_EVENT_API_CALLS_PER_MONTH',
      unit: 'API_CALL',
      aggregationGroup: {
        name: 'monthly'
      },
      formula: 'SUM({TrainingEventApi.API_CALL})'
    }]
};

