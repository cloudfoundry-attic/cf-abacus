'use strict';
/* eslint no-unused-expressions: 1 */

const reqMock = require('./request-mock.js');

const extend = require('underscore').extend;
const urienv = require('abacus-urienv');

require('abacus-metering-config');
require('abacus-rating-config');
require('abacus-pricing-config');


const uris = urienv({
  provisioning: 9880,
  account: 9881
});


describe('Normalize tests', () => {
  // const sandbox = sinon.sandbox.create();
  const usageDoc = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };
  const expectedUsageDoc = extend({}, usageDoc, {
    resource_type: 'test-resource-type',
    account_id: 'test-account',
    pricing_country: 'test-pricing-conutry',
    metering_plan_id: 'test-metering-plan-id',
    rating_plan_id: 'test-rating-plan-id',
    pricing_plan_id: 'test-pricing-plan-id',
    prices: 'test-pricing-plan'
  });

  const okResponses = {
    'meteringId': { metering_plan_id: expectedUsageDoc.metering_plan_id },
    'ratingId' : { rating_plan_id: expectedUsageDoc.rating_plan_id },
    'pricingId' : { pricing_plan_id: expectedUsageDoc.pricing_plan_id },
    'pricingPlan': { pricing_plan: expectedUsageDoc.prices }
  };

  const responses = {
    'meteringId': {},
    'ratingId' : {},
    'pricingId' : {},
    'pricingPlan': {}
  };

  const setResponses = (modMethod, err) => {
    for (let method in responses)
      if (method === modMethod)
        responses[method] = err;
      else
        responses[method] = okResponses[method];
  };

  let callError;

  require.cache[require.resolve('abacus-metering-config')].exports = {
    id: (oid, rtype, ppid, time, auth, cb) => cb(callError, responses.meteringId)
  };
  require.cache[require.resolve('abacus-rating-config')].exports = {
    id: (oid, rtype, ppid, time, auth, cb) => cb(callError, responses.ratingId)
  };
  require.cache[require.resolve('abacus-pricing-config')].exports = {
    id: (oid, rtype, ppid, time, auth, cb) => cb(callError, responses.pricingId),
    plan: (ppid, country, auth, cb) => cb(callError, responses.pricingPlan)
  };

  const normalize = require('../lib/normalizer.js');
  const accountUri = `${uris.account}/v1/organizations/:org_id/account/:time`;

  context('normalize valid usage document', () => {

    const expectedAccount = {
      account_id: expectedUsageDoc.account_id,
      pricing_country: expectedUsageDoc.pricing_country
    };

    reqMock.setSpy(uris.provisioning + '/v1/provisioning/resources/:resource_id/type',
      { statusCode: 200, body: expectedUsageDoc.resource_type });

    reqMock.setSpy(accountUri, { statusCode: 200, body: expectedAccount });

    it('should normalize the doc without errors', async() => {
      setResponses();
      const normalizedUsageDoc = await normalize(usageDoc);
      expect(normalizedUsageDoc).to.be.deep.equal(expectedUsageDoc);
    });

    const getError = async() => {
      try {
        await normalize(usageDoc);
      } catch (err) {
        return err;
      }
      return null;
    };

    it('should throw error if plan id not found', async() => {
      for (let method in responses) {
        setResponses(method, { error: 'Error' });
        expect(await getError()).to.not.be.null;
      }
    });

    it('should throw error if plan id cannot be retrieved', async() => {
      callError = 'Error';
      setResponses();
      expect(await getError()).to.not.be.null;
    });


    it('should throw error if unable to retrieve resource type', async() => {
      reqMock.setSpy(uris.provisioning + '/v1/provisioning/resources/:resource_id/type',
        { statusCode: 404 });
      setResponses();
      expect(await getError()).to.not.be.null;

    });

  });


});
