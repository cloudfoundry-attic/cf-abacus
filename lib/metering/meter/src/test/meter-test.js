'use strict';
/* eslint no-unused-expressions: 1 */

// const reqMock = require('./request-mock.js');

const extend = require('underscore').extend;

const meteringPlan = {
  metrics: [
    {
      name: 'thousand_light_api_calls',
      unit: 'THOUSAND_CALLS',
      type: 'discrete',
      meter: ((m) => new BigNumber(m.light_api_calls).div(1000).toNumber()).toString()
    }
  ]
};

// const urienv = require('abacus-urienv');

const mconfig = require('abacus-metering-config');
// require('abacus-rating-config');
// require('abacus-pricing-config');


// const uris = urienv({
//   provisioning: 9880,
//   account: 9881
// });


describe('Metering tests', () => {
  // const sandbox = sinon.sandbox.create();
  const normalizedUsageDoc = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    resource_type: 'test-resource-type',
    account_id: 'test-account',
    pricing_country: 'test-pricing-conutry',
    metering_plan_id: 'test-metering-plan-id',
    rating_plan_id: 'test-rating-plan-id',
    pricing_plan_id: 'test-pricing-plan-id',
    prices: 'test-pricing-plan',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 2000
      }
    ]
  };

  require.cache[require.resolve('abacus-metering-config')].exports = {
    plan: (mpid, auth, cb) => cb(undefined, mconfig.compile(meteringPlan))
  };
  const meter = require('../lib/meter.js');

  const expectedUsageDoc = extend({}, normalizedUsageDoc, {
    'metered_usage': [
      {
        'metric': 'thousand_light_api_calls',
        'quantity': 2
      }
    ]
  });

  context('apply metering with valid usage document', () => {
    it('should apply metering function with no errors', async() => {
      expect(await meter.meterUsage(normalizedUsageDoc)).to.deep.equal(expectedUsageDoc);
    });
  });
});
