'use strict';

const createPlanBuilder = require('../../plans/plan-builder');

const isFunction = (value) => typeof value === 'function';

describe('PlanBuilder', () => {
  const planId = 'plan-id';

  let planBuilder;

  beforeEach(() => {
    planBuilder = createPlanBuilder();
  });

  describe('createMeteringPlan', () => {
    const meteringPlan = {
      plan_id: 'user-provided-plan',
      data: 1
    };

    context('when no plan is provided', () => {
      it('should return default plan', () => {
        const plan = planBuilder.createMeteringPlan(planId);

        expect(plan.plan_id).to.equal(planId);
        expect(plan.measures).to.deep.equal([{
          name: 'sampleName',
          unit: 'sampleUnit'
        }]);

        expect(plan.metrics.length).to.equal(1);
        expect(plan.metrics[0]).to.include({
          name: 'sampleName',
          unit: 'sampleUnit',
          type: 'discrete'
        });

        expect(plan.metrics[0].meter).to.satisfy(isFunction);
        expect(plan.metrics[0].accumulate).to.satisfy(isFunction);
        expect(plan.metrics[0].aggregate).to.satisfy(isFunction);
        expect(plan.metrics[0].summarize).to.satisfy(isFunction);
      });
    });

    context('when plan is provided', () => {
      it('should change "plan_id"', () => {
        const plan = planBuilder.createMeteringPlan(planId, meteringPlan);
        expect(plan).to.deep.equal({
          plan_id: planId,
          data: 1
        });
      });
    });
  });

  describe('createRatingPlan', () => {
    const ratingPlan = {
      plan_id: 'user-provided-plan',
      metrics: [{
        name: 'calls',
        data: 1
      }],
      data: 1
    };

    context('when no plan is provided', () => {
      it('should return default plan', () => {
        const plan = planBuilder.createRatingPlan(planId);
        expect(plan).to.deep.equal({
          plan_id: planId,
          metrics: [{
            name: 'sampleName'
          }]
        });
      });
    });

    context('when plan is provided', () => {
      it('should create plan with given id and original metrics', () => {
        const plan = planBuilder.createRatingPlan(planId, ratingPlan);
        expect(plan).to.deep.equal({
          plan_id: planId,
          metrics: [{
            name: 'calls'
          }]
        });
      });
    });
  });

  describe('createPricingPlan', () => {
    const pricingPlan = {
      plan_id: 'user-provided-plan',
      metrics: [{
        name: 'calls',
        data: 1
      }],
      data: 1
    };

    context('when no plan is provided', () => {
      it('should return default plan', () => {
        const plan = planBuilder.createPricingPlan(planId);
        expect(plan).to.deep.equal({
          plan_id: planId,
          metrics:  [{
            name: 'sampleName',
            prices: [{
              country: 'sampleCountry',
              price: 0
            }]
          }]
        });
      });
    });

    context('when plan is provided', () => {
      it('should create plan with given id and original metrics', () => {
        const plan = planBuilder.createPricingPlan(planId, pricingPlan);

        expect(plan).to.deep.equal({
          plan_id: planId,
          metrics:  [{
            name: 'calls',
            prices: [{
              country: 'sampleCountry',
              price: 0
            }]
          }]
        });
      });
    });
  });
});
