'use strict';

const { extend } = require('underscore');
const Normalizer = require('../lib/normalizer');

describe('Normalizer tests', () => {
  const sandbox = sinon.sandbox.create();

  const validProvisioningPluginClient = {
    getResourceType: sandbox.stub(),
    getPricingPlan: sandbox.stub()
  };

  const validAccountPluginClient = {
    getMeteringId: sandbox.stub(),
    getRatingId: sandbox.stub(),
    getPricingId: sandbox.stub(),
    getAccount: sandbox.stub()
  };

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

  beforeEach(() => {
    validProvisioningPluginClient.getResourceType.resolves(resourceType);
    validProvisioningPluginClient.getPricingPlan.resolves(prices);

    validAccountPluginClient.getAccount.resolves(account);
    validAccountPluginClient.getMeteringId.resolves(meteringPlan);
    validAccountPluginClient.getRatingId.resolves(ratingPlan);
    validAccountPluginClient.getPricingId.resolves(pricingPlan);
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('when successfully getting plugins data', () => {
    let normalizedDoc;

    beforeEach(async() => {
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

  const generateContext = (stub, operation) => context(`when ${operation} fails`, () => {
    const errorResponse = { error: 'error', reason: 'reason' };
    let normalizer;

    beforeEach(async() => {
      stub.resolves(errorResponse);
      normalizer = new Normalizer(validProvisioningPluginClient, validAccountPluginClient);
    });

    it('all data is verified', async() => {
      await assertPromise.isRejected(normalizer.normalizeUsage(rabbitMsg), errorResponse);
    });
  });

  context('on failure', () => {
    generateContext(validProvisioningPluginClient.getResourceType, 'get resource type');
    generateContext(validProvisioningPluginClient.getPricingPlan, 'get pricing plan');
    generateContext(validAccountPluginClient.getAccount, 'get account');
    generateContext(validAccountPluginClient.getMeteringId, 'get meter id');
    generateContext(validAccountPluginClient.getRatingId, 'get rating id');
    generateContext(validAccountPluginClient.getPricingId, 'get pricing id');
  });

});
