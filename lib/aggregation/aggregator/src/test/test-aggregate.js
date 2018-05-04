'use strict';

delete process.env.SAMPLING;

const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
const seqid = require('abacus-seqid');
const aggregator = require('..');

describe('abacus-usage-aggregator', () => {
  const aggregate = yieldable.functioncb(aggregator.aggregate);
  const accumulatedUsage = (rid, s, e, p, api, dmem, mmem) => ({
    id: dbclient.kturi(rid, p),
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

  it('calls aggregate function for new org', (done) => {
    const usage = accumulatedUsage('id1',
      moment.now(), moment.now() + 1, moment.now(),
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
});
