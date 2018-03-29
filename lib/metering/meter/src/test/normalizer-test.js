'use strict';

const { extend } = require('underscore');
const Normalizer = require('../lib/normalizer');

describe('Normalizer tests', () => {
  let sandbox;

  let validProvisioningPluginClient;
  let validAccountPluginClient;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    validProvisioningPluginClient = {
      getResourceType: sandbox.stub(),
      getPricingPlan: sandbox.stub()
    };

    validAccountPluginClient = {
      getMeteringId: sandbox.stub(),
      getRatingId: sandbox.stub(),
      getPricingId: sandbox.stub(),
      getAccount: sandbox.stub()
    };
  });

  context('when successfully getting plugins data', () => {
    const resourceType = 'resource-type';
    const account = {
      account_id: 'account_id',
      pricing_country: 'pricing_country'
    };
    const meteringPlan = {
      metering_plan_id: 'metering_plan_id'
    };
    const ratingPlan = {
      rating_plan_id: 'rating_plan_id'
    };
    const pricingPlan = {
      pricing_plan_id: 'pricing_plan_id'
    };
    const prices = {
      pricing_plan: 'pricing_plan'
    };
    const rabbitMsg = {
      end: 123,
      organization_id: 'organization_id',
      plan_id: 'plan_id',
      resource_id: 'resource_id'
    };

    let normalizedDoc;

    beforeEach(async() => {
      validProvisioningPluginClient.getResourceType.returns(Promise.resolve(resourceType));
      validAccountPluginClient.getAccount.returns(Promise.resolve(account));
      validAccountPluginClient.getMeteringId.returns(Promise.resolve(meteringPlan));
      validAccountPluginClient.getRatingId.returns(Promise.resolve(ratingPlan));
      validAccountPluginClient.getPricingId.returns(Promise.resolve(pricingPlan));
      validProvisioningPluginClient.getPricingPlan.returns(Promise.resolve(prices));

      const normalizer = new Normalizer(validProvisioningPluginClient, validAccountPluginClient);

      normalizedDoc = await normalizer.normalizeUsage(rabbitMsg);
    });

    it('normalized document is extended', () => {
      expect(normalizedDoc).to.deep.equal(extend({}, rabbitMsg, {
        resource_type: resourceType,
        account_id: account.account_id,
        pricing_country: account.pricing_country,
        metering_plan_id: meteringPlan.metering_plan_id,
        rating_plan_id: ratingPlan.rating_plan_id,
        pricing_plan_id: pricingPlan.pricing_plan_id,
        prices: prices.pricing_plan
      }));
    });

    it('getResourceType is called with correct arguments', () => {
      assert.calledWith(validProvisioningPluginClient.getResourceType, rabbitMsg.resource_id);
    });

    it('getMeteringId is called with correct arguments', () => {
      assert.calledWithExactly(validAccountPluginClient.getMeteringId,
        rabbitMsg.organization_id, resourceType, rabbitMsg.plan_id, rabbitMsg.end);
    });

    it('getRatingId is called with correct arguments', () => {
      assert.calledWithExactly(validAccountPluginClient.getRatingId,
        rabbitMsg.organization_id, resourceType, rabbitMsg.plan_id, rabbitMsg.end);
    });

    it('getPricingId is called with correct arguments', () => {
      assert.calledWithExactly(validAccountPluginClient.getPricingId,
        rabbitMsg.organization_id, resourceType, rabbitMsg.plan_id, rabbitMsg.end);
    });

    it('getPricingPlan is called with correct arguments', () => {
      assert.calledWithExactly(validProvisioningPluginClient.getPricingPlan,
        pricingPlan.pricing_plan_id, account.pricing_country);
    });
  });
});
