'use strict';

const { extend } = require('underscore');
const { reducerConfig } = require('../lib/reducer-config');

const rc = reducerConfig(() => {});

describe('reducer config test', () => {
  const dedupId = 'dedup-id';

  let udoc = {
    organization_id: 'org-id',
    resource_instance_id: 'res-instance-id',
    consumer_id: 'consumer-id',
    plan_id: 'plan-id',
    metering_plan_id: 'metering-plan-id',
    pricing_plan_id: 'pricing-plan-id',
    rating_plan_id: 'rating-plan-id'
  };

  context('usage doc does not contain dedup id',() => {
    it('output key is correct', () => {
      expect(rc.output.keys(udoc)[3]).not.to.include(dedupId);
      expect(rc.output.keys(udoc)[3]).to
        .equal('org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id');
    });
  });

  context('usage doc contains dedup id',() => {
    beforeEach(() => {
      udoc = extend(udoc, { dedup_id: dedupId });
    });

    it('output key is correct', () => {
      expect(rc.output.keys(udoc)[3]).to.include(dedupId);
      expect(rc.output.keys(udoc)[3]).to
        .equal('org-id/res-instance-id/consumer-id/plan-id/metering-plan-id/rating-plan-id/pricing-plan-id/dedup-id');
    });
  });
});
