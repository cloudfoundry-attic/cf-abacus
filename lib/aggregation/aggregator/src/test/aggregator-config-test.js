'use strict';

/* eslint-disable no-unused-expressions */

const { extend, omit } = require('underscore');
const { createDataflowReductionConfig } = require('../lib/aggregator-config');

describe('aggregator reducer config test', () => {
  const dedupId = 'dedup-id';

  let udoc = {
    organization_id: 'org-id',
    space_id: 'space-id',
    resource_instance_id: 'res-instance-id',
    consumer_id: 'consumer-id',
    plan_id: 'plan-id',
    metering_plan_id: 'metering-plan-id',
    pricing_plan_id: 'pricing-plan-id',
    rating_plan_id: 'rating-plan-id'
  };

  let reducerConfig;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const validateReducerConfig = () => context('for usage doc with', () => {
    context('consumer id missing', () => {
      const udocWithoutConsumer = omit(udoc, 'consumer_id');

      it('correct input key is returned', () => {
        expect(reducerConfig.input.key(udocWithoutConsumer)).to.equal('org-id');
      });

      it('correct input groups is returned', () => {
        expect(reducerConfig.input.groups(udocWithoutConsumer)).to.deep.equal([
          'org-id',
          'org-id/space-id/UNKNOWN',
          'org-id/space-id',
          'org-id/res-instance-id/UNKNOWN/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id'
        ]);
      });

      it('output key is correct', () => {
        expect(reducerConfig.output.keys(udocWithoutConsumer)).to.deep.equal([
          'org-id',
          'org-id/space-id/UNKNOWN',
          'org-id/space-id',
          'org-id/res-instance-id/UNKNOWN/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id'
        ]);
      });

      context('usage doc contains dedup id', () => {
        let udocWithDedupId;
        beforeEach(() => {
          reducerConfig = createDataflowReductionConfig(sandbox.stub().returns(false), sandbox.any, sandbox.any);
          udocWithDedupId = extend({}, udocWithoutConsumer, { dedup_id: dedupId });
        });

        it('output key is correct', () => {
          expect(reducerConfig.output.keys(udocWithDedupId)).to.deep.equal([
            'org-id',
            'org-id/space-id/UNKNOWN',
            'org-id/space-id',
            'org-id/res-instance-id/UNKNOWN/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id/dedup-id'
          ]);
        });
      });
    });

    context('consumer id provided', () => {

      it('correct input groups is returned', () => {
        expect(reducerConfig.input.groups(udoc)).to.deep.equal([
          'org-id',
          'org-id/space-id/consumer-id',
          'org-id/space-id',
          'org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id'
        ]);
      });

      it('output key is correct', () => {
        expect(reducerConfig.output.keys(udoc)).to.deep.equal([
          'org-id',
          'org-id/space-id/consumer-id',
          'org-id/space-id',
          'org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id'
        ]);
      });

      context('usage doc contains dedup id', () => {
        let udocWithDedupId;
        beforeEach(() => {
          reducerConfig = createDataflowReductionConfig(sandbox.stub().returns(false), sandbox.any, sandbox.any);
          udocWithDedupId = extend({}, udoc, {
            dedup_id: dedupId
          });
        });

        it('output key is correct', () => {
          expect(reducerConfig.output.keys(udocWithDedupId)).to.deep.equal([
            'org-id',
            'org-id/space-id/consumer-id',
            'org-id/space-id',
            'org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id/dedup-id'
          ]);
        });
      });
    });

  });

  context('when secured', () => {
    beforeEach(() => {
      reducerConfig = createDataflowReductionConfig(sandbox.stub().returns(true), sandbox.any, sandbox.any);
    });

    it('correct write scopes are returned', () => {
      expect(reducerConfig.input.wscope(udoc)).to.deep.equal({
        system: ['abacus.usage.write']
      });
    });

    it('correct read scopes are returned', () => {
      expect(reducerConfig.input.rscope(udoc)).to.deep.equal({
        system: ['abacus.usage.read']
      });
    });

    validateReducerConfig();
  });

  context('when not secured', () => {
    beforeEach(() => {
      reducerConfig = createDataflowReductionConfig(sandbox.stub().returns(false), sandbox.any, sandbox.any);
    });

    it('correct write scopes are returned', () => {
      expect(reducerConfig.input.wscope(udoc)).to.be.undefined;
    });

    it('correct read scopes are returned', () => {
      expect(reducerConfig.input.rscope(udoc)).to.be.undefined;
    });

    validateReducerConfig();
  });
});
