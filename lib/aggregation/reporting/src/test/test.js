'use strict';

// Usage reporting service.

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const dataflow = require('abacus-dataflow');
const yieldable = require('abacus-yieldable');
const dbclient = require('abacus-dbclient');

const map = _.map;
const extend = _.extend;

const brequest = batch(request);

const testResourceId = 'test-resource-id';

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

// Mock the request module
const getspy = (reqs, cb) => {
  // Expect a call to account
  expect(reqs[0][0]).to.equal(
    'http://localhost:9881/v1/organizations/:org_id/account/:time');

  cb(undefined, map(reqs, (req) => [undefined, {
    statusCode:
      /unauthorized/.test(req[1].org_id || req[1].account_id) ? 401 : 200
  }]));
};

const reqmock = extend({}, request, {
  batch_get: (reqs, cb) => getspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const validatorspy = spy((req, res, next) => next());
const cachespy = spy(() => {
  const f = () => undefined;
  f.start = () => undefined;
  return f;
});
const authorizespy = spy((auth, escope) => {});
const oauthmock = extend({}, oauth, {
  validator: () => validatorspy,
  cache: () => cachespy(),
  authorize: () => authorizespy()
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

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

const report = require('..');

const storeAccumulatedUsage = (accUsage, cb = () => {}) => {
  const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage');
  yieldable.functioncb(accumulatordb.put)(extend({}, accUsage, {
    _id: accUsage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

const storeRatedUsage = (ratedUsage, cb = () => {}) => {
  const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
  yieldable.functioncb(aggregatordb.put)(extend({}, ratedUsage, {
    _id: ratedUsage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

// Org id
const oid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';
// Space id
const sid = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
// One of the two consumers at a given org based on plan id.
const cid = (p) => p !== 'standard' ? 'UNKNOWN' :
  'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';
// construct consumer doc id
const cdid = (orgid, sid, cid, t) =>
  ['k', orgid, sid, cid, 't', t].join('/');
// the metering plan id
const mpid = 'test-metering-plan';
// the rating plan id
const rpid = (p) => p !== 'standard' ? 'test-rating-plan' :
  'test-rating-plan-standard';
// the pricing plan id
const ppid = (p) => p !== 'standard' ? 'test-pricing-basic' :
  'test-pricing-standard';
// the plan id
const pid = (p, mpid, rpid, ppid) =>
  [p, mpid, rpid, ppid].join('/');

// accumulated usage id
const accid = (oid, rid) => 'k/' + oid + '/' + rid + '/UNKNOWN/basic/' +
  'test-metering-plan/test-rating-plan/' +
  'test-pricing-basic/t/0001446418800000';

// resource_instance_id
const rid = '0b39fa70-a65f-4183-bae8-385633ca5c87';

// cost -> cost for memory
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

const ratedConsumerTemplate = (orgid, start, end, plan, a, p,
    processed, coid) => ({
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

const consumerReferenceTemplate = (orgid, sid, plan, processed, conid) => ({
  id: conid || cid(plan),
  t: processed + ''
});

const buildSpaceUsage = (a, p, c) => [{
  space_id: sid,
  resources: [{
    resource_id: testResourceId,
    aggregated_usage: a,
    plans: p
  }],
  consumers: c
}];

const buildResourceUsage = (a, p) => [{
  resource_id: testResourceId,
  aggregated_usage: a,
  plans: p
}];

const ratedTemplate = (id, orgid, start, end, processed, a, p, c) => ({
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
  resources: buildResourceUsage(a, p),
  spaces: buildSpaceUsage(a, p, c)
});

const planReportTemplate = (plan, planUsage, planWindow) =>
  extend(buildPlanUsage(plan, planUsage), { windows: planWindow });

const consumerReportTemplate = (plan, a, p, planWindow) => ({
  consumer_id: cid(plan),
  windows: planWindow,
  resources: [{
    resource_id: testResourceId,
    windows: planWindow,
    aggregated_usage: a,
    plans: p
  }]
});

const spaceReportTemplate = (tw, au, plans, consumers) => [{
  space_id: sid,
  windows: tw,
  resources: [{
    resource_id: testResourceId,
    windows: tw,
    aggregated_usage: au,
    plans: plans
  }],
  consumers: consumers
}];

const reportTemplate = (id, tw, au, plans, consumers) => ({
  id: id,
  organization_id: oid,
  account_id: '1234',
  start: 1420502400000,
  end: 1420502500000,
  processed: 1420502500000,
  windows: tw,
  resources: [{
    resource_id: testResourceId,
    windows: tw,
    aggregated_usage: au,
    plans: plans
  }],
  spaces: spaceReportTemplate(tw, au, plans, consumers)
});

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

const accumulatedTemplate = (oid, acc) => extend(planTemplate(), {
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

// Convenient test case:
// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = buildAggregatedUsage(1, 100, 300, {
  consumed: 475200000,
  consuming: 6
}, {
  consumed: 10843200000,
  consuming: 6
}, 1, 3, 45, { price: 0.00014 }, undefined, undefined, undefined, true);

// Space A, consumer B, plan standard/basic/standard/standard
const planBUsage = buildAggregatedUsage(20, 200, 3000, {
  consumed: 633600000,
  consuming: 8
}, {
  consumed: 14457600000,
  consuming: 8
}, 10, 8, 540, { price: 0.00028 }, undefined, undefined, undefined, true);

describe('abacus-usage-report', () => {
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB,
      /^abacus-aggregator|^abacus-accumulator/, done);
  });

  context('when rated usage contains small numbers', () => {
    before((done) => {
      // Doc id
      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';
      const orgid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';

      const rated = ratedTemplate(id, oid, 1420502400000, 1420502500000,
        1420502500000, buildAggregatedUsage(21, 300, 3300, {
          consumed: 1108800000,
          consuming: 14
        }, {
          consumed: 25300800000,
          consuming: 14
        }), [
          buildPlanUsage('basic', planAUsage),
          buildPlanUsage('standard', planBUsage)
        ], [
          consumerReferenceTemplate(orgid, sid, 'basic', 1420502500000,
           'UNKNOWN'),
          consumerReferenceTemplate(orgid, sid, 'standard', 1420502500000,
           'external:bbeae239-f3f8-483c-9dd0-de6781c38bab')
        ]);

      const consumer1 = ratedConsumerTemplate(orgid, 1420502400000,
        1420502500000, 'basic',
        buildAggregatedUsage(1, 100, 300, {
          consumed: 475200000,
          consuming: 6
        }, {
          consumed: 10843200000,
          consuming: 6
        }), [buildPlanUsage('basic', planAUsage)], 1420502500000);

      const consumer2 = ratedConsumerTemplate(orgid, 1420502400000,
        1420502500000, 'standard',
        buildAggregatedUsage(20, 200, 3000, {
          consumed: 633600000,
          consuming: 8
        }, {
          consumed: 14457600000,
          consuming: 8
        }), [buildPlanUsage('standard', planBUsage)], 1420502500000);

      storeRatedUsage(rated, () => storeRatedUsage(consumer1,
        () => storeRatedUsage(consumer2, done)));
    });

    it('retrieves rated usage for an organization', (done) => {
      // Define the expected usage report
      const planAReport = planReportTemplate('basic', buildAggregatedUsage(1,
        100, 300, {
          consumed: 475200000,
          consuming: 6
        }, {
          consumed: 10843200000,
          consuming: 6
        }, 1, 3, 45, { price: 0.00014 }, 114, 0.01596, true, true, true),
        buildWindow(undefined, undefined, undefined, undefined, undefined,
        49.01596));
      const planBReport = planReportTemplate('standard', buildAggregatedUsage(
        20, 200, 3000, {
          consumed: 633600000,
          consuming: 8
        }, {
          consumed: 14457600000,
          consuming: 8
        }, 10, 8, 540, { price: 0.00028 }, 152, 0.04256, true, true, true),
        buildWindow(undefined, undefined, undefined, undefined,
          undefined, 558.04256));

      const consumer1 = consumerReportTemplate('basic', buildAggregatedUsage(
        undefined, undefined, undefined, undefined,
        undefined,
        1, 3, 45, undefined, undefined, 0.01596, undefined, undefined,
        true), [planAReport], buildWindow(undefined,
        undefined, undefined, undefined, undefined, 49.01596));
      const consumer2 = consumerReportTemplate('standard', buildAggregatedUsage(
        undefined, undefined, undefined, undefined, undefined,
        10, 8, 540, undefined, undefined, 0.04256, undefined, undefined,
        true), [planBReport], buildWindow(undefined, undefined,
          undefined, undefined, undefined, 558.04256));

      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';

      const expected = reportTemplate(id, buildWindow(undefined, undefined,
        undefined, undefined, undefined, 607.05852),
        buildAggregatedUsage(undefined, undefined, undefined, undefined,
          undefined, 11, 11, 585, undefined, undefined, 0.05852,
          undefined, undefined,
        true), [planAReport, planBReport], [consumer1, consumer2]);

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        let cbs = 0;
        const cb = () => {
          if(++cbs === 2) {
            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 2 : 0);

            done();
          }
        };

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: oid,
            time: 1420574400000
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            cb();
          });

        // Attempt to get the rated usage for a time in the next month
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: oid,
            time: 1422921800000
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect an empty usage report for the month
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal({
              id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001422921800000',
              organization_id: oid,
              start: 1422748800000,
              end: 1422921800000,
              resources: [],
              spaces: []
            });
            cb();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });

    it('queries rated usage for an organization', (done) => {

      // Define a GraphQL query and the corresponding expected result
      const query = '{ organization(organization_id: ' +
        '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420574400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { charge } }}}}';

      const expected = {
        organization: {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          windows: buildWindow(undefined, undefined, undefined, undefined,
            undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: buildAggregatedUsage(undefined, undefined,
              undefined, undefined, undefined, 11, 11, 585, undefined,
              undefined, 0.05852, undefined, undefined, true)
          }]
        }
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);

            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);

            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });

    it('queries rated usage using GraphQL queries', (done) => {

      // Define the GraphQL query and the corresponding expected result
      const query = '{ organizations(organization_ids: ' +
        '["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], time: 1420574400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { charge }}}}}';
      const expected = {
        organizations: [{
          organization_id: oid,
          windows: buildWindow(undefined, undefined, undefined, undefined,
            undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: buildAggregatedUsage(undefined, undefined,
              undefined, undefined, undefined, 11, 11, 585, undefined,
              undefined, 0.05852, undefined, undefined, true)
          }]
        }]
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        let cbs = 0;
        const cb = () => {
          if (++cbs === 4) {
            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 6 : 0);

            done();
          }
        };

        // Get the rated usage
        brequest.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);

            cb();
          });

        // Unauthorized organizations and account queries
        const uqueries = ['{ organizations(organization_ids: ' +
          '["unauthorized"]) { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge }}}}}',
          '{ organization(organization_id: ' +
          '"unauthorized") { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge }}}}}',
          '{ account(account_id: ' +
          '"unauthorized") { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge }}}}}'];

        // Get the rated usage for unauthorized org and account
        map(uqueries, (uquery) => {
          brequest.get(
            'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
              headers: {
                authorization: 'Bearer test'
              },
              p: server.address().port,
              query: uquery
            }, (err, val) => {
              expect(err).to.equal(undefined);

              // Expect our test rated usage as empty
              expect(val.statusCode).to.equal(400);
              expect(val.body.error).to.contain('query');

              cb();
            });
        });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });

  context('when rated usage contains big numbers', () => {
    before((done) => {
      const bigNumberRated = {
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        consumer_id: 'UNKNOWN',
        resource_instance_id: rid,
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [null],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.5
                          },
                          cost: {
                            consumed: 0,
                            consuming: 0.5,
                            price: 0.00014
                          },
                          summary: 0.036679722222222225,
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 156250,
                            consuming: 0.625
                          },
                          cost: {
                            consumed: 156250,
                            consuming: 0.625,
                            price: 0.00014
                          },
                          summary: 0.08925243055555555,
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 19690125,
                            consuming: 7.125
                          },
                          cost: {
                            consumed: 19690125,
                            consuming: 7.125,
                            price: 0.00014
                          },
                          summary: 5.992165208333334,
                          charge: 0.0008389031291666666
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 1454053167.96875,
                            consuming: 9.28515625
                          },
                          cost: {
                            consumed: 1454053167.96875,
                            consuming: 9.28515625,
                            price: 0.00014
                          },
                          summary: 404.58481167317706,
                          charge: 0.05664187363424479
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008389031291666666
                    }
                  ],
                  [
                    {
                      charge: 0.05664187363424479
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008389031291666666
                    }
                  ],
                  [
                    {
                      charge: 0.05664187363424479
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 5.13516111111111e-06
                }
              ],
              [
                {
                  charge: 1.249534027777778e-05
                }
              ],
              [
                {
                  charge: 0.0008389031291666666
                }
              ],
              [
                {
                  charge: 0.05664187363424479
                }
              ]
            ]
          }
        ],
        spaces: [
          {
            space_id: '582018c9-e396-4f59-9945-b1bd579a819b',
            resources: [
              {
                resource_id: testResourceId,
                plans: [
                  {
                    plan_id: 'basic/test-metering-plan/' +
                      'test-rating-plan/test-pricing-basic',
                    metering_plan_id: 'test-metering-plan',
                    rating_plan_id: 'test-rating-plan',
                    pricing_plan_id: 'test-pricing-basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125
                              },
                              cost: {
                                consumed: 0,
                                consuming: 0.03125,
                                price: 0.00014
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            consumers: { id: 'UNKNOWN', t: '1448457444188' },
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          },
          {
            space_id: 'c228ecc8-15eb-446f-a4e6-a2d05a729b98',
            resources: [
              {
                resource_id: testResourceId,
                plans: [
                  {
                    plan_id: 'basic/test-metering-plan/' +
                      'test-rating-plan/test-pricing-basic',
                    metering_plan_id: 'test-metering-plan',
                    rating_plan_id: 'test-rating-plan',
                    pricing_plan_id: 'test-pricing-basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125
                              },
                              cost: {
                                consumed: 0,
                                consuming: 0.03125,
                                price: 0.00014
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            consumers: { id: 'UNKNOWN', t: '1448457444188' },
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          },
          {
            space_id: '69d4d85b-03f7-436e-b293-94d1803b42bf',
            resources: [
              {
                resource_id: testResourceId,
                plans: [
                  {
                    plan_id: 'basic/test-metering-plan/' +
                      'test-rating-plan/test-pricing-basic',
                    metering_plan_id: 'test-metering-plan',
                    rating_plan_id: 'test-rating-plan',
                    pricing_plan_id: 'test-pricing-basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 78616062.5,
                                consuming: 2.09765625
                              },
                              cost: {
                                consumed: 78616062.5,
                                consuming: 2.09765625,
                                price: 0.00014
                              },
                              summary: 80.0006135828993,
                              charge: 0.011200085901605903
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.011200085901605903
                    }
                  ]
                ]
              }
            ],
            consumers: { id: 'UNKNOWN', t: '1448457444188' },
            windows: [
              [null],
              [null],
              [null],
              [null],
              [
                {
                  charge: 0.011200085901605903
                }
              ]
            ]
          },
          {
            space_id: '4ef2f706-f2ae-4be5-a18c-40a969cf8fb6',
            resources: [
              {
                resource_id: testResourceId,
                plans: [
                  {
                    plan_id: 'basic/test-metering-plan/' +
                      'test-rating-plan/test-pricing-basic',
                    metering_plan_id: 'test-metering-plan',
                    rating_plan_id: 'test-rating-plan',
                    pricing_plan_id: 'test-pricing-basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [null],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.5
                              },
                              cost: {
                                consumed: 0,
                                consuming: 0.5,
                                price: 0.00014
                              },
                              summary: 0.036679722222222225,
                              charge: 5.13516111111111e-06
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 156250,
                                consuming: 0.625
                              },
                              cost: {
                                consumed: 156250,
                                consuming: 0.625,
                                price: 0.00014
                              },
                              summary: 0.08925243055555555,
                              charge: 1.249534027777778e-05
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 19684375,
                                consuming: 7.125
                              },
                              cost: {
                                consumed: 19684375,
                                consuming: 7.125,
                                price: 0.00014
                              },
                              summary: 5.990567986111111,
                              charge: 0.0008386795180555555
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 1155809375,
                                consuming: 7.125
                              },
                              cost: {
                                consumed: 1155809375,
                                consuming: 7.125,
                                price: 0.00014
                              },
                              summary: 321.5808457638889,
                              charge: 0.04502131840694444
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [null],
                      [
                        {
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [null],
                      [
                        {
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [null],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008386795180555555
                    }
                  ],
                  [
                    {
                      charge: 0.04502131840694444
                    }
                  ]
                ]
              }
            ],
            consumers: { id: 'UNKNOWN', t: '1448457444188' },
            windows: [
              [null],
              [
                {
                  charge: 5.13516111111111e-06
                }
              ],
              [
                {
                  charge: 1.249534027777778e-05
                }
              ],
              [
                {
                  charge: 0.0008386795180555555
                }
              ],
              [
                {
                  charge: 0.04502131840694444
                }
              ]
            ]
          },
          {
            space_id: 'eac5125c-74ff-4984-9ba6-2eea7158490f',
            resources: [
              {
                resource_id: testResourceId,
                plans: [
                  {
                    plan_id: 'basic/test-metering-plan/' +
                      'test-rating-plan/test-pricing-basic',
                    metering_plan_id: 'test-metering-plan',
                    rating_plan_id: 'test-rating-plan',
                    pricing_plan_id: 'test-pricing-basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [null],
                          [null],
                          [null],
                          [
                            {
                              quantity: {
                                consumed: 5750,
                                consuming: 0
                              },
                              cost: {
                                consumed: 5750,
                                consuming: 0,
                                price: 0.00014
                              },
                              summary: 0.0015972222222222223,
                              charge: 2.2361111111111e-07
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 11500,
                                consuming: 0
                              },
                              cost: {
                                consumed: 11500,
                                consuming: 0,
                                price: 0.00014
                              },
                              summary: 0.0031944444444444446,
                              charge: 4.4722222222222e-07
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [null],
                      [null],
                      [null],
                      [
                        {
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [null],
                      [null],
                      [null],
                      [
                        {
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [null],
                  [null],
                  [null],
                  [
                    {
                      charge: 2.2361111111111e-07
                    }
                  ],
                  [
                    {
                      charge: 4.4722222222222e-07
                    }
                  ]
                ]
              }
            ],
            consumers: { id: 'UNKNOWN', t: '1448457444188' },
            windows: [
              [null],
              [null],
              [null],
              [
                {
                  charge: 2.2361111111111e-07
                }
              ],
              [
                {
                  charge: 4.4722222222222e-07
                }
              ]
            ]
          }
        ],
        start: 1448284898000,
        end: 1448457443000,
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/t/0001448457444188-0-0-1-0',
        processed: 1448457444188,
        windows: [
          [null],
          [
            {
              charge: 5.13516111111111e-06
            }
          ],
          [
            {
              charge: 1.249534027777778e-05
            }
          ],
          [
            {
              charge: 0.0008389031291666666
            }
          ],
          [
            {
              charge: 0.05664187363424479
            }
          ]
        ]
      };
      const consumer1 = {
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/' +
          '582018c9-e396-4f59-9945-b1bd579a819b/UNKNOWN/t/1448457444188',
        consumer_id: 'UNKNOWN',
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        resource_instance_id: rid,
        start: 1448284898000,
        end: 1448457443000,
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.03125,
                            since: 1448284898000
                          },
                          cost: {
                            consumed: 0,
                            consuming: 0.03125,
                            price: 0.00014
                          },
                          summary: 1.5000789409722222,
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          }
        ],
        windows: [
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0.0002100110517361111
            }
          ]
        ]
      };
      const consumer2 = {
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/' +
          'c228ecc8-15eb-446f-a4e6-a2d05a729b98/UNKNOWN/t/1448457444188',
        consumer_id: 'UNKNOWN',
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        resource_instance_id: rid,
        start: 1448284898000,
        end: 1448457443000,
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.03125
                          },
                          cost: {
                            consumed: 0,
                            consuming: 0.03125,
                            price: 0.00014
                          },
                          summary: 1.5000789409722222,
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          }
        ],
        windows: [
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 0.0002100110517361111
            }
          ]
        ]
      };
      const consumer3 = {
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/' +
          '69d4d85b-03f7-436e-b293-94d1803b42bf/UNKNOWN/t/1448457444188',
        consumer_id: 'UNKNOWN',
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        resource_instance_id: rid,
        start: 1448284898000,
        end: 1448457443000,
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 78616062.5,
                            consuming: 2.09765625
                          },
                          cost: {
                            consumed: 78616062.5,
                            consuming: 2.09765625,
                            price: 0.00014
                          },
                          summary: 80.0006135828993,
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.011200085901605903
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.011200085901605903
                    }
                  ]
                ]
              }
            ],
            windows: [
              [null],
              [null],
              [null],
              [null],
              [
                {
                  charge: 0.011200085901605903
                }
              ]
            ]
          }
        ],
        windows: [
          [null],
          [null],
          [null],
          [null],
          [
            {
              charge: 0.011200085901605903
            }
          ]
        ]
      };
      const consumer4 = {
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/' +
          '4ef2f706-f2ae-4be5-a18c-40a969cf8fb6/UNKNOWN/t/1448457444188',
        consumer_id: 'UNKNOWN',
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        resource_instance_id: rid,
        start: 1448284898000,
        end: 1448457443000,
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [null],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.5
                          },
                          cost: {
                            consumed: 0,
                            consuming: 0.5,
                            price: 0.00014
                          },
                          summary: 0.036679722222222225,
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 156250,
                            consuming: 0.625
                          },
                          cost: {
                            consumed: 156250,
                            consuming: 0.625,
                            price: 0.00014
                          },
                          summary: 0.08925243055555555,
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 19684375,
                            consuming: 7.125
                          },
                          cost: {
                            consumed: 19684375,
                            consuming: 7.125,
                            price: 0.00014
                          },
                          summary: 5.990567986111111,
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 1155809375,
                            consuming: 7.125
                          },
                          cost: {
                            consumed: 1155809375,
                            consuming: 7.125,
                            price: 0.00014
                          },
                          summary: 321.5808457638889,
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [null],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008386795180555555
                    }
                  ],
                  [
                    {
                      charge: 0.04502131840694444
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [null],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008386795180555555
                    }
                  ],
                  [
                    {
                      charge: 0.04502131840694444
                    }
                  ]
                ]
              }
            ],
            windows: [
              [null],
              [
                {
                  charge: 5.13516111111111e-06
                }
              ],
              [
                {
                  charge: 1.249534027777778e-05
                }
              ],
              [
                {
                  charge: 0.0008386795180555555
                }
              ],
              [
                {
                  charge: 0.04502131840694444
                }
              ]
            ]
          }
        ],
        windows: [
          [null],
          [
            {
              charge: 5.13516111111111e-06
            }
          ],
          [
            {
              charge: 1.249534027777778e-05
            }
          ],
          [
            {
              charge: 0.0008386795180555555
            }
          ],
          [
            {
              charge: 0.04502131840694444
            }
          ]
        ]
      };
      const consumer5 = {
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/' +
          'eac5125c-74ff-4984-9ba6-2eea7158490f/UNKNOWN/t/1448457444188',
        consumer_id: 'UNKNOWN',
        resources: [
          {
            resource_id: testResourceId,
            plans: [
              {
                plan_id: 'basic/test-metering-plan/' +
                  'test-rating-plan/test-pricing-basic',
                metering_plan_id: 'test-metering-plan',
                rating_plan_id: 'test-rating-plan',
                pricing_plan_id: 'test-pricing-basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [null],
                      [null],
                      [null],
                      [
                        {
                          quantity: {
                            consumed: 5750,
                            consuming: 0
                          },
                          cost: {
                            consumed: 5750,
                            consuming: 0,
                            price: 0.00014
                          },
                          summary: 0.0015972222222222223,
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 11500,
                            consuming: 0
                          },
                          cost: {
                            consumed: 11500,
                            consuming: 0,
                            price: 0.00014
                          },
                          summary: 0.0031944444444444446,
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [null],
                  [null],
                  [null],
                  [
                    {
                      charge: 2.2361111111111e-07
                    }
                  ],
                  [
                    {
                      charge: 4.4722222222222e-07
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [null],
                  [null],
                  [null],
                  [
                    {
                      charge: 2.2361111111111e-07
                    }
                  ],
                  [
                    {
                      charge: 4.4722222222222e-07
                    }
                  ]
                ]
              }
            ],
            windows: [
              [null],
              [null],
              [null],
              [
                {
                  charge: 2.2361111111111e-07
                }
              ],
              [
                {
                  charge: 4.4722222222222e-07
                }
              ]
            ]
          }
        ],
        windows: [
          [null],
          [null],
          [null],
          [
            {
              charge: 2.2361111111111e-07
            }
          ],
          [
            {
              charge: 4.4722222222222e-07
            }
          ]
        ]
      };
      storeRatedUsage(bigNumberRated, () => storeRatedUsage(consumer1, () =>
        storeRatedUsage(consumer2, () => storeRatedUsage(consumer3, () =>
        storeRatedUsage(consumer4, () => storeRatedUsage(consumer5, done))))));
    });

    it('retrieves rated usage with 16 significant digits', (done) => {
      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage', {
            p: server.address().port,
            organization_id: oid
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect test rated usage without error
            expect(val.statusCode).to.equal(200);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });

  context('when rated usage contains a slack', () => {
    before((done) => {
      // This test only care about October 31st.
      const planWindow = [
        [{ quantity: 0, cost: 0, previous_quantity: null }],
        [{ quantity: 0, cost: 0, previous_quantity: null }],
        [{ quantity: 0, cost: 0, previous_quantity: null }],
        [{
          quantity: {
            consumed: 158400000,
            consuming: 1
          },
          previous_quantity: null,
          cost: {
            consumed: 158400000,
            consuming: 1,
            price: 0.00014
          }
        }, {
          quantity: {
            consumed: 172800000,
            consuming: 2
          },
          cost: {
            consumed: 172800000,
            consuming: 2,
            price: 0.00014
          }
        }, { quantity: 0, cost: 0 }],
        [{
          quantity: {
            consumed: 158400000,
            consuming: 1
          },
          previous_quantity: null,
          cost: {
            consumed: 158400000,
            consuming: 1,
            price: 0.00014
          }
        }, {
          quantity: {
            consumed: -5011200000,
            consuming: 2
          },
          cost: {
            consumed: -5011200000,
            consuming: 2,
            price: 0.00014
          }
        }]
      ];

      const aggrWindow = [
        [{ quantity: 0,
          previous_quantity: null }],
        [{ quantity: 0,
          previous_quantity: null }],
        [{ quantity: 0,
          previous_quantity: null }],
        [{
          quantity: {
            consumed: 158400000,
            consuming: 1
          },
          previous_quantity: null
        }, {
          quantity: {
            consumed: 172800000,
            consuming: 2
          }
        }, { quantity: 0 }],
        [{
          quantity: {
            consumed: 158400000,
            consuming: 1
          },
          previous_quantity: null
        }, {
          quantity: {
            consumed: -5011200000,
            consuming: 2
          }
        }]
      ];
      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29/t/0001446418800000';
      const orgid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29';

      const rated = ratedTemplate(id, orgid, 1446415200000, 1446415200000,
        1446418800000, [{
          metric: 'memory',
          windows: aggrWindow
        }], [buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], [consumerReferenceTemplate(orgid, sid, 'basic', 1446418800000,
           'UNKNOWN'), consumerReferenceTemplate(orgid, sid, 'basic',
           1446163200000, 'UNKNOWN2')]);

      const consumer = ratedConsumerTemplate(orgid, 1446415200000,
        1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446418800000);

      const consumer2 = ratedConsumerTemplate(orgid, 1446415200000,
        1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446163200000, 'UNKNOWN2');

      storeRatedUsage(rated, () => storeRatedUsage(consumer,
        () => storeRatedUsage(consumer2, done)));
    });

    it('checks that time-based resource uses its bounds', (done) => {

      // Define the expected values for the october 31st window
      const expectedDay = {
        summary: 48,
        charge: 0.00672,
        quantity: {
          consumed: 172800000,
          consuming: 2
        },
        cost: {
          consumed: 172800000,
          consuming: 2,
          price: 0.00014
        }
      };
      // Define the expected values for the month window
      const expectedMonth = {
        summary: 48,
        charge: 0.00672,
        quantity: {
          consumed: -5011200000,
          consuming: 2
        },
        cost: {
          consumed: -5011200000,
          consuming: 2,
          price: 0.00014
        }
      };

      const verify = (done) => {
        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29',
            time: 1446508800000
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect the october window value to be based in october only
            expect(val.statusCode).to.equal(200);
            const au = val.body.resources[0].plans[0].aggregated_usage[0];
            expect(au.windows[3][1]).to.deep.equal(expectedDay);
            expect(au.windows[4][1]).to.deep.equal(expectedMonth);

            // Expect UNKNOWN2's day windows to be null and month window shifted
            expect(val.body.spaces[0].consumers[1].resources[0]
              .aggregated_usage[0].windows[3][0]).to.equal(null);
            expect(val.body.spaces[0].consumers[1].resources[0]
              .aggregated_usage[0].windows[3][1]).to.equal(null);
            expect(val.body.spaces[0].consumers[1].resources[0]
              .aggregated_usage[0].windows[4][0]).to.equal(null);
            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(done);
    });
  });

  context('when accumulated usage has small numbers', () => {
    before((done) => {

      const accumulated = accumulatedTemplate(oid, buildAccumulatedUsage(
        { current: 1 }, { current: 1 }, { current: 100 }, 1, 0.03, 15,
        undefined, true, undefined));
      storeAccumulatedUsage(accumulated, done);
    });

    it('Retrieve accumulated usage', (done) => {
      const verify = (done) => {
        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        const expected = {
          id: accid(oid, rid),
          end: 1446415200000,
          processed: 1446418800000,
          start: 1446415200000,
          resource_id: testResourceId,
          space_id: sid,
          organization_id: oid,
          consumer_id: 'UNKNOWN',
          resource_instance_id: rid,
          plan_id: 'basic',
          metering_plan_id: 'test-metering-plan',
          rating_plan_id: 'test-rating-plan',
          pricing_plan_id: 'test-pricing-basic',
          accumulated_usage: buildAccumulatedUsage(1, 1, 100, 1, 0.03, 15,
            true, true, true),
          windows: [[null], [null], [null],
            [{
              charge: 16.03
            }, null],
            [{
              charge: 16.03
            }, null]
          ]
        };

        // Get the accumulated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/:organization_id/' +
          'spaces/:space_id/resource_id/:resource_id/' +
          'resource_instances/:resource_instance_id/' +
          'consumers/:consumer_id/plans/:plan_id/' +
          'metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
          'pricing_plans/:pricing_plan_id/t/:t/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
            resource_id: testResourceId,
            resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
            consumer_id: 'UNKNOWN',
            plan_id: 'basic',
            space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
            metering_plan_id: 'test-metering-plan',
            rating_plan_id: 'test-rating-plan',
            pricing_plan_id: 'test-pricing-basic',
            t: '0001446418800000',
            time: 1446418800000
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.body).to.deep.equal(expected);
            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(done);
    });

    it('Retrieve accumulated usage using a GraphQL query', (done) => {
      const verify = (done) => {
        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Define the graphql query
        const query = '{ resource_instance(organization_id: ' +
          '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", space_id: ' +
          '"aaeae239-f3f8-483c-9dd0-de5d41c38b6a", consumer_id: "UNKNOWN", ' +
          'resource_instance_id: "0b39fa70-a65f-4183-bae8-385633ca5c87", ' +
          'plan_id: "basic", metering_plan_id: "test-metering-plan", ' +
          'rating_plan_id: "test-rating-plan", pricing_plan_id: ' +
          '"test-pricing-basic", t: "0001446418800000", ' +
          'time: 1446418800000 ) ' +
          '{ organization_id, consumer_id, resource_instance_id, plan_id, ' +
          'accumulated_usage { metric, windows { quantity, cost, charge, ' +
          'summary } }, windows { charge }}}';

        const expected = {
          resource_instance: {
            organization_id: oid,
            consumer_id: 'UNKNOWN',
            resource_instance_id: rid,
            plan_id: 'basic',
            accumulated_usage: buildAccumulatedUsage(1, 1, 100, 1, 0.03, 15,
              true, true, true),
            windows: [[null], [null], [null],
              [{
                charge: 16.03
              }, null],
              [{
                charge: 16.03
              }, null]
            ]
          }
        };

        // Get the accumulated usage
        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test accumulated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);

            // Check oauth validator spy
            // expect(validatorspy.callCount).to.equal(secured ? 1 : 0);

            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(done);
    });
  });

  context('when querying complex usage with graphql', () => {

    before((done) => {
      const accumulated = {
        id: 'k/org/ins/con/basic/' +
          'test-metering-plan/test-rating-plan/' +
          'test-pricing-basic/t/0001456185600000',
        organization_id: 'org',
        space_id: 'spa',
        resource_id: testResourceId,
        consumer_id: 'con',
        resource_instance_id: 'ins',
        plan_id: 'basic',
        metering_plan_id: 'test-metering-plan',
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic',
        start: 1456099200000,
        end: 1456099200000,
        processed: 1456185600000,
        accumulated_usage: [{
          metric: 'memory',
          windows: [[null], [null], [null], [null],
            [{
              quantity: {
                current: { consuming: 0, consumed: 3628800000 },
                previous: { consuming: 2, consumed: 0 }
              },
              cost: 50803200
            }]
          ]
        }]
      };

      storeAccumulatedUsage(accumulated, done);
    });

    it('Retrieve complex accumulated usage using a GraphQL query', (done) => {
      const expected = {
        resource_instance: {
          organization_id: 'org',
          consumer_id: 'con',
          resource_instance_id: 'ins',
          plan_id: 'basic',
          accumulated_usage: [
            {
              metric: 'memory',
              windows: [ [ null ], [ null ], [ null ], [ null ], [
                {
                  quantity: {
                    consuming: 0,
                    consumed: 3628800000
                  }
                }
              ] ]
            }
          ]
        }
      };

      const verify = (done) => {
        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Query with no sub selections in quantity
        const query1 = '{ resource_instance(organization_id: ' +
          '"org", space_id: "spa", consumer_id: "con", resource_instance_id: ' +
          '"ins", plan_id: "basic", metering_plan_id: "test-metering-plan", ' +
          'rating_plan_id: "test-rating-plan", pricing_plan_id: ' +
          '"test-pricing-basic", t: "0001456185600000", ' +
          'time: 1456185600000 ) ' +
          '{ organization_id, consumer_id, resource_instance_id, plan_id, ' +
          'accumulated_usage { metric, windows { quantity }}}}';

        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query1
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // No sub selections will return the query with a null value
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            done();
          });
      };

      // Verify
      verify(done);
    });
  });
});

// OAuth token
const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';
const tokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-usage-reporting',
  authorities: [
    'abacus.usage.read'
  ],
  scope: [
    'abacus.usage.read'
  ],
  client_id: 'abacus-usage-reporting',
  cid: 'abacus-usage-reporting',
  azp: 'abacus-usage-reporting',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-usage-reporting',
    'abacus.usage'
  ]
};

const orgUsagePath =
  '/v1/metering/organizations/:organization_id/aggregated/usage/:time';

const resInstanceUsagePath =
  '/v1/metering/organizations/:organization_id/spaces/:space_id/' +
  'resource_id/:resource_id/' +
  'resource_instances/:resource_instance_id/consumers/:consumer_id/plans/' +
  ':plan_id/metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
  'pricing_plans/:pricing_plan_id/t/:t/aggregated/usage/:time';

const queryPath = '/v1/metering/aggregated/usage/graph/:query';

// Org id
const oid2 = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';

const orgUsageParams = {
  organization_id: oid2,
  time: 1420574400000
};

const resInstanceUsageParams = {
  organization_id: oid2,
  space_id: sid,
  resource_instance_id: rid,
  resource_id: testResourceId,
  consumer_id: 'UNKNOWN',
  plan_id: 'basic',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  t: '0001446418800000',
  time: 1446418800000
};

// Define a GraphQL query and the corresponding expected result
const query = '{ organization(organization_id: "' +
  oid2 + '", time: 1420574400000) { ' +
  'organization_id, windows { charge }, resources { resource_id, ' +
  'aggregated_usage { metric, windows { charge } }}}}';

process.env.SECURED = 'true';
process.env.JWTKEY = tokenSecret;
process.env.JWTALGO = tokenAlgorithm;

describe('abacus-usage-report-auth', () => {
  let report;
  let server;

  const requireModules = () => {
    // Mock the oauth module
    const oauth = require('abacus-oauth');
    const oauthmock = extend({}, oauth, {
      cache: () => cachespy()
    });
    require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

    report = require('..');
  };

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-oauth')];
    delete require.cache[require.resolve('..')];
  };

  const prepareRatedUsage = (done) => {
    const id = 'k/' + oid2 + '/t/0001420502400000';
    const rated = ratedTemplate(id, oid2, 1420502400000, 1420502500000,
      1420502500000, buildAggregatedUsage(21, 300, 3300, {
        consumed: 1108800000,
        consuming: 14
      }, {
        consumed: 25300800000,
        consuming: 14
      }), [
        buildPlanUsage('basic', planAUsage)
      ], [
        consumerReferenceTemplate(oid2, sid, 'basic', 1420502500000,
          'UNKNOWN')
      ]);
    const consumer1 = ratedConsumerTemplate(oid2, 1420502400000,
      1420502500000, 'basic',
      buildAggregatedUsage(1, 100, 300, {
        consumed: 475200000,
        consuming: 6
      }, {
        consumed: 10843200000,
        consuming: 6
      }), [buildPlanUsage('basic', planAUsage)], 1420502500000);

    storeRatedUsage(rated, () => storeRatedUsage(consumer1, done));
  };

  const prepareAccumulatedUsage = (done) => {
    const accumulated = accumulatedTemplate(oid2, buildAccumulatedUsage(
      { current: 1 }, { current: 1 }, { current: 100 }, 1, 0.03, 15,
      undefined, true, undefined));
    storeAccumulatedUsage(accumulated, done);
  };

  before((done) => {
    deleteModules();
    requireModules();

    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-aggregator|^abacus-accumulator/,
      () => prepareRatedUsage(() => prepareAccumulatedUsage(done)));
  });

  beforeEach(() => {
    // Create a test report app
    const app = report();

    // Listen on an ephemeral port
    server = app.listen(0);
  });

  context('with a valid token that has a system scope', () => {
    const signedToken = jwt.sign(tokenPayload, tokenSecret,
      { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('succeeds when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        });
    });

    it('succeeds when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        });
    });

    it('succeeds when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        });
    });
  });

  context('with a valid token that has a correct resource scope', () => {
    const signedToken = jwt.sign(extend(tokenPayload,
      { scope: [`abacus.usage.${testResourceId}.read`] }),
      tokenSecret, { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('fails with 403 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

    it('succeeds when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        });
    });

    it('fails when 403 retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });
  });

  context('with a valid token that has an incorrect resource scope', () => {
    const signedToken = jwt.sign(extend(tokenPayload,
      { scope: ['abacus.usage.test-resource-2.read'] }),
      tokenSecret, { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('fails with 403 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

    it('fails with 403 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

    it('fails with 403 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });
  });

  context('with a valid token that doesnt have any scopes', () => {
    const signedToken = jwt.sign(extend(tokenPayload, { scope: [] }),
      tokenSecret, { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('fails with 403 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

    it('fails with 403 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

    it('fails with 403 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        });
    });

  });

  context('with no token', () => {
    const headers = {
      headers: {}
    };

    it('fails with 401 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        });
    });

    it('fails with 401 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for an organization
      request.get('http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        });
    });

    it('fails with 401 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get('http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        });
    });
  });
});
