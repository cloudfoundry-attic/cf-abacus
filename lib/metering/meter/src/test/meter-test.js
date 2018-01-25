'use strict';

const { extend } = require('underscore');
const mconfig = require('abacus-metering-config');

const Meter = require('../lib/meter');

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

const expectedUsageDoc = extend({}, normalizedUsageDoc, {
  'metered_usage': [
    {
      'metric': 'thousand_light_api_calls',
      'quantity': 2
    }
  ]
});

describe('test meter', () => {

  context('when metering usage', () => {

    let mconfigStub;
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      mconfigStub = sandbox.stub(mconfig, 'plan');
    });

    afterEach(() => {
      sandbox.restore();
    });

    const validateMeterUsage = async(expected) => {
      const meter = new Meter(mconfig);
      expect(await meter.meterUsage(normalizedUsageDoc)).to.deep.equal(expected);
    };

    it('succeed if metering plan exist', async() => {
      mconfigStub.yields(undefined, mconfig.compile(meteringPlan));
      validateMeterUsage(expectedUsageDoc);
    });

    it('fails if metering plan throws', async() => {
      mconfigStub.throws('Error');
      validateMeterUsage(extend({}, normalizedUsageDoc, {
        error: 'INTERNAL_SERVER_ERROR'
      }));
    });

    it('fails if business error occure', async() => {
      const err = { error: 'err', reason: 'reason', cause: 'cause' };
      mconfigStub.yields(undefined, err);
      validateMeterUsage(extend({}, normalizedUsageDoc, err));
    });

  });

});
