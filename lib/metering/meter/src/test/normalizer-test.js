'use strict';

const { omit, extend } = require('underscore');
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

  describe('create Normalizer', () => {
    context('when valid parameters are provided', () => {
      it('does not throw an error', () => {
        expect(() => new Normalizer(validProvisioningPluginClient, validAccountPluginClient)).not.to.throw();
      });
    });

    context('when invalid provisioningPluginClient is provided', () => {

      const itProvisioningClientPropertyMissing = (paramName) =>
        context(`when provisioningPluginClient has no ${paramName}`, () => {
          it('throws an error', () => {
            const client = omit(validProvisioningPluginClient, paramName);
            expect(() => new Normalizer(client, validAccountPluginClient))
              .to.throw('Provided provisioning plugin client is not valid.');
          });
        });

      itProvisioningClientPropertyMissing('getResourceType');
      itProvisioningClientPropertyMissing('getPricingPlan');
    });

    context('when invalid accountPluginClient is provided', () => {

      const itAccountClientPropertyMissing = (paramName) =>
        context(`when accountPluginClient has no ${paramName}`, () => {
          it('throws an error', () => {
            const client = omit(validAccountPluginClient, paramName);
            expect(() => new Normalizer(validProvisioningPluginClient, client))
              .to.throw('Provided account plugin client is not valid.');
          });
        });

      itAccountClientPropertyMissing('getMeteringId');
      itAccountClientPropertyMissing('getRatingId');
      itAccountClientPropertyMissing('getPricingId');
      itAccountClientPropertyMissing('getAccount');
    });
  });

  describe('normalize', () => {

    context('when normalize is called', () => {
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
      const doc = {
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

        normalizedDoc = await normalizer.normalize(doc);
      });

      it('normalized document is extended', () => {
        expect(normalizedDoc).to.deep.equal(extend({}, doc, {
          resource_type: resourceType,
          account_id: account.account_id,
          pricing_country: account.pricing_country,
          metering_plan_id: meteringPlan.metering_plan_id,
          rating_plan_id: ratingPlan.rating_plan_id,
          pricing_plan_id: pricingPlan.pricing_plan_id,
          prices: prices.pricing_plan
        }));
      });

      it('getResourceType is called properly', () => {
        assert.calledWith(validProvisioningPluginClient.getResourceType, doc.resource_id);
      });

      it('getMeteringId is called properly', () => {
        assert.calledWithExactly(validAccountPluginClient.getMeteringId,
          doc.organization_id, resourceType, doc.plan_id, doc.end);
      });

      it('getRatingId is called properly', () => {
        assert.calledWithExactly(validAccountPluginClient.getRatingId,
          doc.organization_id, resourceType, doc.plan_id, doc.end);
      });

      it('getPricingId is called properly', () => {
        assert.calledWithExactly(validAccountPluginClient.getPricingId,
          doc.organization_id, resourceType, doc.plan_id, doc.end);
      });

      it('getPricingPlan is called properly', () => {
        assert.calledWithExactly(validProvisioningPluginClient.getPricingPlan,
          pricingPlan.pricing_plan_id, account.pricing_country);
      });
    });

  });

});
