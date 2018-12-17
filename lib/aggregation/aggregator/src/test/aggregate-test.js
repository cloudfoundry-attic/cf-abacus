'use strict';
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

delete process.env.SAMPLING;

// const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
// const seqid = require('abacus-seqid');

const { extend } = require('underscore');

const { buildAccumulatedUsage } = require('./templates');  

const aggregator = require('..');


describe('abacus-usage-aggregator', () => {
  // const aggregate = yieldable.functioncb(aggregator.aggregate);


  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      now: Date.UTC(2015, 0, 3, 12),
      toFake: ['Date']
    });
    // dbclient.drop(dbEnv, /^abacus-aggregator-/, done);

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
