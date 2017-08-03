'use strict';

// Usage reporting service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const dbclient = require('abacus-dbclient');
const async = require('async');

const map = _.map;
const extend = _.extend;
const builder = require('./lib/builder.js');
const storage = require('./lib/storage.js');
const mocker = require('./lib/mocker.js');
const brequest = batch(request);

/* eslint quotes: 1 */

process.env.DB = process.env.DB || 'test';

mocker.mockRequestModule();
mocker.mockClusterModule();
const oauthMocks = mocker.mockOAuthModule();
const validatorspy = oauthMocks.validatorspy;

let report = require('..');

const resourceId = '0b39fa70-a65f-4183-bae8-385633ca5c87';
const testResourceId = 'test-resource-id';
const oid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';
const sid = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const cid = (p) => p !== 'standard' ? 'UNKNOWN' :
  'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';

const planReportTemplate = (plan, planUsage, planWindow) =>
  extend(builder.buildPlanUsage(plan, planUsage), { windows: planWindow });

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

// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = builder.buildAggregatedUsage(1, 100, 300, {
  consumed: 475200000,
  consuming: 6
}, {
  consumed: 10843200000,
  consuming: 6
}, 1, 3, 45, { price: 0.00014 }, undefined, undefined, undefined, true);

// Space A, consumer B, plan standard/basic/standard/standard
const planBUsage = builder.buildAggregatedUsage(20, 200, 3000, {
  consumed: 633600000,
  consuming: 8
}, {
  consumed: 14457600000,
  consuming: 8
}, 10, 8, 540, { price: 0.00028 }, undefined, undefined, undefined, true);

describe('abacus-usage-report', () => {

  beforeEach(() => {
    // mocker.mockRequestModule();
  });

  before((done) => {
    dbclient.drop(process.env.DB,
      /^abacus-aggregator|^abacus-accumulator/, done);
  });

  context('when rated usage contains small numbers', () => {
    before((done) => {
      // Doc id
      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';
      const orgid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';

      const rated = builder.ratedTemplate(id, oid, sid, testResourceId,
        1420502400000, 1420502500000,
        1420502500000, builder.buildAggregatedUsage(21, 300, 3300, {
          consumed: 1108800000,
          consuming: 14
        }, {
          consumed: 25300800000,
          consuming: 14
        }), [
          builder.buildPlanUsage('basic', planAUsage),
          builder.buildPlanUsage('standard', planBUsage)
        ], [
          builder.consumerReferenceTemplate(1420502500000,
           'UNKNOWN'),
          builder.consumerReferenceTemplate(1420502500000,
           'external:bbeae239-f3f8-483c-9dd0-de6781c38bab')
        ]);

      const consumer1 = builder.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId,
        1420502400000, 1420502500000, 'basic',
        builder.buildAggregatedUsage(1, 100, 300, {
          consumed: 475200000,
          consuming: 6
        }, {
          consumed: 10843200000,
          consuming: 6
        }), [builder.buildPlanUsage('basic', planAUsage)], 1420502500000);

      const consumer2 = builder.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId,
        1420502400000, 1420502500000, 'standard',
        builder.buildAggregatedUsage(20, 200, 3000, {
          consumed: 633600000,
          consuming: 8
        }, {
          consumed: 14457600000,
          consuming: 8
        }), [builder.buildPlanUsage('standard', planBUsage)], 1420502500000);

      storage.aggregator.put(rated,
        () => storage.aggregator.put(consumer1,
        () => storage.aggregator.put(consumer2, done)));
    });

    context('retrieves rated usage for an organization', () => {
      let expected;
      let app;
      let server;
      const url = 'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time';
      const time = 1420574400000;

      const validateAggregatedUsage = (url, port, oid, time, cb) => {
        request.get(
          url, {
            p: port,
            organization_id: oid,
            time: time
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            cb();
          });
      };

      const verify = (secured, cb) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        app = report();
        server = app.listen(0);
        const port = server.address().port;

        validateAggregatedUsage(url, port, oid, time, cb);
      };

      before(() => {
        const planAReport = planReportTemplate('basic',
          builder.buildAggregatedUsage(1,
          100, 300, {
            consumed: 475200000,
            consuming: 6
          }, {
            consumed: 10843200000,
            consuming: 6
          }, 1, 3, 45, { price: 0.00014 }, 114, 0.01596, true, true, true),
          builder.buildWindow(undefined, undefined, undefined,
          undefined, undefined, 49.01596));
        const planBReport = planReportTemplate('standard',
          builder.buildAggregatedUsage(
          20, 200, 3000, {
            consumed: 633600000,
            consuming: 8
          }, {
            consumed: 14457600000,
            consuming: 8
          }, 10, 8, 540, { price: 0.00028 }, 152, 0.04256, true, true, true),
          builder.buildWindow(undefined, undefined, undefined, undefined,
            undefined, 558.04256));

        const consumer1 = consumerReportTemplate('basic',
          builder.buildAggregatedUsage(
          undefined, undefined, undefined, undefined,
          undefined,
          1, 3, 45, undefined, undefined, 0.01596, undefined, undefined,
          true), [planAReport], builder.buildWindow(undefined,
          undefined, undefined, undefined, undefined, 49.01596));
        const consumer2 = consumerReportTemplate('standard',
        builder.buildAggregatedUsage(
          undefined, undefined, undefined, undefined, undefined,
          10, 8, 540, undefined, undefined, 0.04256, undefined, undefined,
          true), [planBReport], builder.buildWindow(undefined, undefined,
            undefined, undefined, undefined, 558.04256));

        const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';

        expected = reportTemplate(id,
          builder.buildWindow(undefined, undefined,
          undefined, undefined, undefined, 607.05852),
          builder.buildAggregatedUsage(undefined, undefined, undefined,
            undefined, undefined, 11, 11, 585, undefined, undefined, 0.05852,
            undefined, undefined,
          true), [planAReport, planBReport], [consumer1, consumer2]);
      });

      it('successfully when throttle limit is not exceeded', (done) => {

        verify(false, () => verify(true, done));
      });

      // Test would fail (time-out) when retrieveUsage doesn't have a callback
      // as an argument and doesn't call that callback
      context('and throttle limit is exceeded', () => {
        before(() => {
          process.env.THROTTLE = 10;
          delete require.cache[require.resolve('..')];
          report = require('..');

        });

        it('succeed', (done) => {
          let cbs = 0;
          const cb = () => {
            if(++cbs === 15) done();
          };

          for(let i = 0; i < 15; i++)
            verify(false, () => verify(true, cb));
        });
      });
    });

    it('queries rated usage for an organization', (done) => {
      const query = '{ organization(organization_id: ' +
        '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420574400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { charge } }}}}';

      const expected = {
        organization: {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          windows: builder.buildWindow(undefined, undefined,
            undefined, undefined, undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: builder.buildAggregatedUsage(undefined, undefined,
              undefined, undefined, undefined, 11, 11, 585, undefined,
              undefined, 0.05852, undefined, undefined, true)
          }]
        }
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        const app = report();
        const server = app.listen(0);

        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);

            done();
          });
      };

      verify(false, () => verify(true, done));
    });

    it('queries rated usage using GraphQL queries', (done) => {
      const query = '{ organizations(organization_ids: ' +
        '["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], time: 1420574400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { charge }}}}}';
      const expected = {
        organizations: [{
          organization_id: oid,
          windows: builder.buildWindow(undefined, undefined, undefined,
          undefined, undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: builder.buildAggregatedUsage(undefined, undefined,
              undefined, undefined, undefined, 11, 11, 585, undefined,
              undefined, 0.05852, undefined, undefined, true)
          }]
        }]
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        const app = report();
        const server = app.listen(0);

        const getRatedUsageRequest = (requestDone) => {
          brequest.get(
            'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
              p: server.address().port,
              query: query
            }, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
              expect(val.body).to.deep.equal(expected);
              requestDone();
            });
        };
       
        const unauthorizedQueries = ['{ organizations(organization_ids: ' +
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

        const unauthorizedRequests = map(unauthorizedQueries, (uquery) => {
          return (requestDone) => {
            brequest.get(
            'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
              headers: {
                authorization: 'Bearer test'
              },
              p: server.address().port,
              query: uquery
            }, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(400);
              expect(val.body.error).to.contain('query');
              requestDone();
            });
          };
        });

        const requests = unauthorizedRequests.concat(getRatedUsageRequest);
        async.parallel(requests, done);
      };

      verify(false, () => verify(true, done));
    });
  });

  context('when rated usage contains big numbers', () => {
    const usage = require('./json/rated-usage.json');

    before((done) => {
      storage.aggregator.put(usage, () =>
        storage.aggregator.put(require('./json/consumer-1.json'), () =>
        storage.aggregator.put(require('./json/consumer-2.json'), () =>
        storage.aggregator.put(require('./json/consumer-3.json'), () =>
        storage.aggregator.put(require('./json/consumer-4.json'), () =>
        storage.aggregator.put(require('./json/consumer-5.json'), done))))));
    });

    it('retrieves rated usage with 16 significant digits', (done) => {
      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        const app = report();
        const server = app.listen(0);

        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: usage.organization_id,
            time: '1448878436000'
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body.spaces.length).to.equal(5);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
            done();
          });
      };

      verify(false, () => verify(true, done));
    });
  });

  // These tests only care about October 31st.  
  context('when rated usage contains a slack', () => {
    before((done) => {
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

      const rated = builder.ratedTemplate(id, orgid, sid, testResourceId,
        1446415200000, 1446415200000,
        1446418800000, [{
          metric: 'memory',
          windows: aggrWindow
        }], [builder.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], [builder.consumerReferenceTemplate(1446418800000,'UNKNOWN'),
          builder.consumerReferenceTemplate(1446163200000, 'UNKNOWN2')]);

      const consumer = builder.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId,
        1446415200000, 1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [builder.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446418800000);

      const consumer2 = builder.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId,
        446415200000, 1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [builder.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446163200000, 'UNKNOWN2');

      storage.aggregator.put(rated, () => storage.aggregator.put(consumer,
        () => storage.aggregator.put(consumer2, done)));
    });

    it('checks that time-based resource uses its bounds', (done) => {
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

      const app = report();
      const server = app.listen(0);

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
    });
  });

  context('when accumulated usage has small numbers', () => {
    const generateAccumulatedUsageId = (oid, rid) => {
      return 'k/' + oid + '/' + rid + '/UNKNOWN/basic/' +
      'test-metering-plan/test-rating-plan/' +
      'test-pricing-basic/t/0001446418800000';
    };

    let server;
    beforeEach(() => {
      server = report().listen(0);
    });

    before((done) => {
      const accumulated = builder.accumulatedTemplate(
        oid, resourceId, sid, testResourceId,
        builder.buildAccumulatedUsage({ current: 1 }, { current: 1 },
        { current: 100 }, 1, 0.03, 15,
        undefined, true, undefined));
      storage.accumulator.put(accumulated, done);
    });

    it('Retrieve accumulated usage', (done) => {
      const expected = {
        id: generateAccumulatedUsageId(oid, resourceId),
        end: 1446415200000,
        processed: 1446418800000,
        start: 1446415200000,
        resource_id: testResourceId,
        space_id: sid,
        organization_id: oid,
        consumer_id: 'UNKNOWN',
        resource_instance_id: resourceId,
        plan_id: 'basic',
        metering_plan_id: 'test-metering-plan',
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic',
        accumulated_usage: builder.buildAccumulatedUsage(1, 1,
          100, 1, 0.03, 15, true, true, true),
        windows: [[null], [null], [null],
          [{
            charge: 16.03
          }, null],
          [{
            charge: 16.03
          }, null]
        ]
      };

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
    });

    it('Retrieve accumulated usage using a GraphQL query', (done) => {
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
          resource_instance_id: resourceId,
          plan_id: 'basic',
          accumulated_usage: builder.buildAccumulatedUsage(1, 1, 100,
            1, 0.03, 15, true, true, true),
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

      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
          p: server.address().port,
          query: query
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expected);

          done();
        });
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

      storage.accumulator.put(accumulated, done);
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

      const app = report();
      const server = app.listen(0);

      const queryWithNoQuantitySelection =
        '{ resource_instance(organization_id: ' +
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
          query: queryWithNoQuantitySelection
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expected);
          done();
        });
    });
  });

  context('when requesting unexisting usage', () => {
    let server;
    beforeEach(() => {
      server = report().listen(0);
    });

    context('on unexisting organization, 404 expected', () => {
      const test = (done, time) => {
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: 'unexisting',
            time: time
          }, (err, val) => {
            expect(val.statusCode).to.equal(404);
            done();
          });
      };

      it('for specific time', (done) => {
        test(done, 1420574400000);
      });

      it('with no specific time,', (done) => {
        test(done);
      });

    });

    it('on existing org, 200 with missing resources', (done) => {
      request.get(
        'http://localhost::p/v1/metering/organizations/' +
        ':organization_id/aggregated/usage', {
          p: server.address().port,
          organization_id: 'some-organization'
        }, (err, val) => {
          expect(val.statusCode).to.equal(200);
          expect(val.body.resources).to.deep.equal([]);
          expect(val.body.spaces).to.deep.equal([]);
          done();
        });
    });

   
  });
});
