'use strict';

const { extend, map } = require('underscore');


const defaultPrices = () => [{
  country: 'sampleCountry',
  price: 0
}];

const buildPricingPlanMetrics = (metrics) =>
  map(metrics, (metric) => ({
    name: metric.name,
    prices: defaultPrices()
  }));

const buildRatingPlanMetrics = (metrics) =>
  map(metrics, (metric) => ({
    name: metric.name
  }));


const create = () => {

  const createMeteringPlan = (planId, meteringPlan) => {
    if (meteringPlan)
      return extend({}, meteringPlan, { plan_id: planId });

    return {
      plan_id: planId,
      measures: [{
        name: 'sampleName',
        unit: 'sampleUnit'
      }],
      metrics: [{
        name: 'sampleName',
        unit: 'sampleUnit',
        type: 'discrete',
        meter : (m) => m.name,
        accumulate:  (a, qty, start, end, from, to, twCell) =>
          end < from || end >= to ? null : new BigNumber(a || 0).add(qty || 0).toNumber(),
        aggregate: (a, prev, curr, aggTwCell, accTwCell) =>
          new BigNumber(a || 0).add(curr || 0).sub(prev || 0).toNumber(),
        summarize: (t, qty) => qty ? qty : 0
      }]
    };
  };

  const createRatingPlan = (planId, meteringPlan) => {
    if (meteringPlan)
      return {
        plan_id: planId,
        metrics: buildRatingPlanMetrics(meteringPlan.metrics)
      };

    return {
      plan_id: planId,
      metrics: [{
        name: 'sampleName'
      }]
    };
  };

  const createPricingPlan = (planId, meteringPlan) => {
    if (meteringPlan)
      return {
        plan_id: planId,
        metrics: buildPricingPlanMetrics(meteringPlan.metrics)
      };

    return {
      plan_id: planId,
      metrics:  [{
        name: 'sampleName',
        prices: defaultPrices()
      }]
    };
  };

  return {
    createMeteringPlan,
    createPricingPlan,
    createRatingPlan
  };
};

module.exports = create;
