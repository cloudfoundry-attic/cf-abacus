'use strict';

const defaultMeter = (m) => {
  return m.name;
};

const defaultAccumulate = (a, qty, start, end, from, to, twCell) => {
  return end < from || end >= to ? null : new BigNumber(a || 0).add(qty || 0).toNumber();
};

const defaultAggregate = (a, prev, curr, aggTwCell, accTwCell) => {
  return new BigNumber(a || 0).add(curr || 0).sub(prev || 0).toNumber();
};

const defaultSummarize = (t, qty) => {
  return qty ? qty : 0;
};

module.exports = (planId = '') => ({
  plan_id: planId,
  measures: [
    {
      name: 'sampleName',
      unit: 'sampleUnit'
    }
  ],
  metrics: [
    {
      name: 'sampleName',
      unit: 'sampleUnit',
      type: 'discrete',
      meter : defaultMeter,
      accumulate: defaultAccumulate,
      aggregate: defaultAggregate,
      summarize: defaultSummarize
    }
  ]
});
