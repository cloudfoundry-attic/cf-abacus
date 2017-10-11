'use strict';

const _ = require('underscore');
const extend = _.extend;

const buildWindow = (qDay, qMonth, s, cDay, cMonth, ch) => {
  const windows = [[null], [null], [null], [{}, null], [{}, null]];
  const setWindowProperty = (k, vDay, vMonth) => {
    if(typeof vDay !== 'undefined' && typeof vMonth !== 'undefined') {
      windows[3][0][k] = vDay;
      windows[4][0][k] = vMonth;
    }
  };
  setWindowProperty('quantity', qDay, qMonth);
  setWindowProperty('summary', s, s);
  setWindowProperty('cost', cDay, cMonth);
  setWindowProperty('charge', ch, ch);
  return windows;
};

const buildAggregatedUsage = (s, l, h, md, mm, sc, lc, hc, mc, ms, mch,
  summary, cost, charge) => [{
  metric: 'storage',
  windows: buildWindow(s, s, summary && s, cost && sc, cost && sc,
    charge && sc)
}, {
  metric: 'thousand_light_api_calls',
  windows: buildWindow(l, l, summary && l, cost && lc, cost && lc,
    charge && lc)
}, {
  metric: 'heavy_api_calls',
  windows: buildWindow(h, h, summary && h, cost && hc, cost && hc,
    charge && hc)
}, {
  metric: 'memory',
  windows: buildWindow(md, mm, summary && ms, cost && extend({}, md, mc),
    cost && extend({}, mm, mc), mch)
}];

const buildAccumulatedUsage = (s, l, h, sc, lc, hc,
  summary, cost, charge) => [{
  metric: 'storage',
  windows: buildWindow(s, s, summary && s, cost && sc, cost && sc,
    charge && sc)
}, {
  metric: 'thousand_light_api_calls',
  windows: buildWindow(l, l, summary && l, cost && lc, cost && lc,
    charge && lc)
}, {
  metric: 'heavy_api_calls',
  windows: buildWindow(h, h, summary && h, cost && hc, cost && hc,
    charge && hc)
}];

const mpid = 'test-metering-plan';
const rpid = (p) => p !== 'standard' ? 'test-rating-plan' :
  'test-rating-plan-standard';
const ppid = (p) => p !== 'standard' ? 'test-pricing-basic' :
  'test-pricing-standard';
const pid = (p, mpid, rpid, ppid) =>
  [p, mpid, rpid, ppid].join('/');
const accid = (oid, rid) => 'k/' + oid + '/' + rid + '/UNKNOWN/basic/' +
  'test-metering-plan/test-rating-plan/' +
  'test-pricing-basic/t/0001446418800000';

const planTemplate = (plan) => ({
  plan_id: plan || 'basic',
  metering_plan_id: mpid,
  rating_plan_id: rpid(plan),
  pricing_plan_id: ppid(plan)
});

const buildPlanUsage = (plan, planUsage) => extend(planTemplate(plan), {
  plan_id: pid(plan || 'basic', mpid, rpid(plan), ppid(plan)),
  aggregated_usage: planUsage
});

const accumulatedTemplate = (oid, rid, sid,
  testResourceId, acc) => extend(planTemplate(), {

  id: accid(oid, rid),
  organization_id: oid,
  space_id: sid,
  resource_id: testResourceId,
  consumer_id: 'UNKNOWN',
  resource_instance_id: rid,
  start: 1446415200000,
  end: 1446415200000,
  processed: 1446418800000,
  accumulated_usage: acc
});

const cdid = (orgid, sid, cid, t) =>
  ['k', orgid, sid, cid, 't', t].join('/');

const ratedConsumerTemplate = (orgid, sid, cid, testResourceId,
  start, end, plan, a, p, processed, coid) => ({
  id: cdid(orgid, sid, coid || cid(plan), processed),
  consumer_id: coid || cid(plan),
  organization_id: orgid,
  resource_instance_id: 'rid',
  start: start,
  end: end,
  processed: processed,
  resources: [{
    resource_id: testResourceId,
    aggregated_usage: a,
    plans: p
  }]
});

const consumerReferenceTemplate = (processedTime, conid) => ({
  id: conid,
  t: processedTime + ''
});

const buildSpaceUsage = (a, p, c, sid, testResourceId) => [{
  space_id: sid,
  resources: [{
    resource_id: testResourceId,
    aggregated_usage: a,
    plans: p
  }],
  consumers: c
}];

const buildResourceUsage = (a, p, testResourceId) => [{
  resource_id: testResourceId,
  aggregated_usage: a,
  plans: p
}];

const ratedTemplate = (id, orgid, sid, testResourceId,
  start, end, processed, a, p, c) => ({
  id: id,
  organization_id: orgid,
  account_id: '1234',
  resource_instance_id: 'rid',
  consumer_id: 'cid',
  start: start,
  end: end,
  resource_id: testResourceId,
  plan_id: 'basic/test-metering-plan/' +
      'test-rating-plan/test-pricing-basic',
  pricing_country: 'USA',
  prices: {
    metrics: [
      { name: 'heavy_api_calls', price: 0.15 },
      { name: 'light_api_calls', price: 0.03 },
      { name: 'storage', price: 1 }
    ]
  },
  processed: processed,
  resources: buildResourceUsage(a, p, testResourceId),
  spaces: buildSpaceUsage(a, p, c, sid, testResourceId)
});

module.exports = {
  buildWindow: buildWindow,
  buildAggregatedUsage: buildAggregatedUsage,
  buildAccumulatedUsage: buildAccumulatedUsage,
  buildPlanUsage: buildPlanUsage,
  accumulatedTemplate: accumulatedTemplate,
  ratedConsumerTemplate: ratedConsumerTemplate,
  consumerReferenceTemplate: consumerReferenceTemplate,
  buildSpaceUsage: buildSpaceUsage,
  buildResourceUsage: buildResourceUsage,
  ratedTemplate: ratedTemplate
};
