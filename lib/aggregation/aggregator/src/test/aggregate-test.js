'use strict';
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

delete process.env.SAMPLING;

// const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
const seqid = require('abacus-seqid');

const { extend } = require('underscore');

const { buildAccumulatedUsage } = require('./templates');  

const aggregator = require('..');


describe('abacus-usage-aggregator', () => {
  const aggregate = yieldable.functioncb(aggregator.aggregate);
  const testResourceInstanceID = '0b39fa70-a65f-4183-bae8-385633ca5c87';
  const accumulatedUsage = (rid, s, e, p, api, dmem, mmem) => ({
    id: 'id',
    collected_usage_id: '555',
    start: s,
    end: e,
    processed: p,
    processed_id: seqid(),
    resource_id: 'test-resource',
    resource_instance_id: rid,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    plan_id: 'basic',
    resource_type: 'test-resource',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'test-metering-plan',
    rating_plan_id: 'test-rating-plan',
    pricing_plan_id: 'test-pricing-basic',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    accumulated_usage: [
      {
        metric: 'heavy_api_calls',
        windows: [[null], [null], [null], [api, null, null], [api, null]]
      },
      {
        metric: 'memory',
        windows: [[null], [null], [null], [dmem, null, null], [mmem, null]]
      }
    ]
  });

  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 12),
      toFake: ['Date']
    });
    // dbclient.drop(dbEnv, /^abacus-aggregator-/, done);

  });

  it('calls aggregate function for new org', (done) => {
    const usage = accumulatedUsage('id1',
      moment.now() + 1, moment.now() + 1, moment.now() + 1,
      {
        'quantity' : {
          'current' : 10
        },
        'cost' : 1
      },
      {
        'quantity' : {
          'current': {
            'consumed': 518400000,
            'consuming': 6,
            'since': 1420243200000
          }
        }
      },
      {
        'quantity' : {
          'current': {
            'consumed': 518400000,
            'consuming': 6,
            'since': 1420243200000
          }
        }
      });

    aggregate([undefined, undefined, undefined], usage, (err, result) => {
      expect(err).to.equal(null);
      expect(result.length).to.equal(4);
      expect(result[2].space_id).to.equal(usage.space_id);
      expect(result[2].resources[0].plans[0]).not.to.equal(undefined);
      expect(result[2].resources[0].plans[0].aggregated_usage[0].windows[4][0].quantity).to.equal(10);
      expect(result[2].resources[0].plans[0].aggregated_usage[1].windows[4][0].quantity.consuming).to.equal(6);
      done();
    });
  });

  context('TODO', () => {
    let orgUsage;
    let processed;
    let startT;
    let endT;
    beforeEach(() => {
      processed = moment.now();
      startT = processed - 10000;
      endT = startT + 5000;
      orgUsage = require('./test-org')(startT - 10000, endT - 10000, processed - 10000);
    });

    it('does not fail when aggregating to zero', yieldable.functioncb(function*() {
      const usage = extend({}, buildAccumulatedUsage(
        testResourceInstanceID,
        startT,
        endT,
        processed,
        {
          quantity: {
            current: 0, previous: 80
          }
        },
        {
          quantity: {
            current: {
              consumed: 518400000,
              consuming: 6,
              since: 1420243200000
            }
          }
        },
        {
          quantity: {
            current: {
              consumed: 13996800000,
              consuming: 6,
              since: 1420243200000
            }
          }
        }
      ),
      { processed_id: processed + '-0-0-0-0' });
      clock.restore();
  
      let err;
      let res;
      try {
        res = yield aggregator.aggregate([orgUsage, null], usage);
      } catch (e) {
        err = e;
      }
  
      expect(err).to.be.equal(undefined);
      expect(res).to.not.be.undefined;
    }));
  
    it('throws error if aggregatorFn returns null, undefined or NaN', yieldable.functioncb(function*() {
      const aggrUsage = extend({}, buildAccumulatedUsage(
        testResourceInstanceID,
        startT,
        endT,
        processed,
        { quantity: { current: NaN }
          // cost: 24 
        },
        {
          quantity: {
            current: {
              consumed: 518400000,
              consuming: 6,
              since: 1420243200000
            }
          }
          // cost: { consumed: 518400000, consuming: 6, price: 0.00014 }
        },
        {
          quantity: {
            current: {
              consumed: 13996800000,
              consuming: 6,
              since: 1420243200000
            }
          }
          // cost: { consumed: 13996800000, consuming: 6, price: 0.00014 }
        }
      ),
      { processed_id: processed + '-0-0-0-0' });
      clock.restore();
      for(let val of [NaN, null, undefined]) {
        aggrUsage.accumulated_usage[0].windows[3][0].quantity.current = val;
        let err;
        try {
          yield aggregator.aggregate([orgUsage, null], aggrUsage);
        } catch (e) {
          err = e;
        }
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Aggregation resulted in invalid value: NaN');
        expect(err.status).to.equal(422);
      }
    }));
  });
});
