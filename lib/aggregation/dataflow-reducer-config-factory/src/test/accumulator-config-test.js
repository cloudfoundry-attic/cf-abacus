'use strict';

const { extend, omit } = require('underscore');
const { createAccumulatorConfig } = require('../lib/accumulator-config');

describe('accumulator reducer config test', () => {
  const dedupId = 'dedup-id';

  const udoc = {
    organization_id: 'org-id',
    resource_instance_id: 'res-instance-id',
    consumer_id: 'consumer-id',
    resource_id: 'resource-id',
    plan_id: 'plan-id',
    metering_plan_id: 'metering-plan-id',
    rating_plan_id: 'rating-plan-id',
    pricing_plan_id: 'pricing-plan-id'
  };

  let reducerConfig;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const validateReducerConfig = (msg, isSecured) => context(msg, () => {
    beforeEach(() => {
      reducerConfig = createAccumulatorConfig(sandbox.stub().returns(isSecured), sandbox.any, sandbox.any);
    });

    it('correct write scopes are returned', () => {
      expect(reducerConfig.input.wscope(udoc)).to.deep.equal(isSecured ?
        { system: ['abacus.usage.write'] } : undefined);
    });

    it('correct read scopes are returned', () => {
      expect(reducerConfig.input.rscope(udoc)).to.deep.equal(isSecured ?
        { system: ['abacus.usage.read'] } : undefined);
    });

    context('consumer id is missing', () => {
      const udocWithoutConsumer = omit(udoc, 'consumer_id');

      it('correct input key is returned', () => {
        expect(reducerConfig.input.key(udocWithoutConsumer))
          .to.equal('org-id/res-instance-id/UNKNOWN/resource-id/plan-id');
      });

      it('correct input groups is returned', () => {
        expect(reducerConfig.input.groups(udocWithoutConsumer)[0]).to.equal(
          'org-id/res-instance-id/UNKNOWN/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id');
      });

      it('output key is correct', () => {
        expect(reducerConfig.output.keys(udocWithoutConsumer)[1]).not.to.include(dedupId);
        expect(reducerConfig.output.keys(udocWithoutConsumer)[1])
          .to.equal('org-id/res-instance-id/UNKNOWN/resource-id/plan-id');
      });

      context('usage doc contains dedup id', () => {
        let udocWithDedupId;
        beforeEach(() => {
          reducerConfig = createAccumulatorConfig(sandbox.stub().returns(false), sandbox.any, sandbox.any);
          udocWithDedupId = extend({}, udocWithoutConsumer, { dedup_id: dedupId });
        });

        it('output key is correct', () => {
          expect(reducerConfig.output.keys(udocWithDedupId)[1]).to.include(dedupId);
          expect(reducerConfig.output.keys(udocWithDedupId)[1])
            .to.equal('org-id/res-instance-id/UNKNOWN/resource-id/plan-id/dedup-id');
        });
      });
    });

    context('consumer id is provided', () => {
      it('correct input key is returned', () => {
        expect(reducerConfig.input.key(udoc))
          .to.equal('org-id/res-instance-id/consumer-id/resource-id/plan-id');
      });

      it('correct input groups is returned', () => {
        expect(reducerConfig.input.groups(udoc)[0]).to.equal(
          'org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id');
      });

      it('output key is correct', () => {
        expect(reducerConfig.output.keys(udoc)[1])
          .to.equal('org-id/res-instance-id/consumer-id/resource-id/plan-id');
      });

      context('usage doc contains dedup id', () => {
        let udocWithDedupId;
        beforeEach(() => {
          reducerConfig = createAccumulatorConfig(sandbox.stub().returns(false), sandbox.any, sandbox.any);
          udocWithDedupId = extend({}, udoc, { dedup_id: dedupId });
        });

        it('output key is correct', () => {
          expect(reducerConfig.output.keys(udocWithDedupId)[1])
            .to.equal('org-id/res-instance-id/consumer-id/resource-id/plan-id/dedup-id');
        });
      });
    });

  });

  validateReducerConfig('secured', true);
  validateReducerConfig('unsecured', false);
});
