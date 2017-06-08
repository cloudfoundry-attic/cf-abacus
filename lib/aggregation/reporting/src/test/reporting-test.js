'use strict';

// Usage reporting service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const dbclient = require('abacus-dbclient');

const map = _.map;
const extend = _.extend;
const helpers = require('./lib/helpers.js');
const mocker = require('./lib/mocker.js');
const brequest = batch(request);

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

mocker.mockRequestModule();
mocker.mockClusterModule();
const oauthMocks = mocker.mockOAuthModule();
const validatorspy = oauthMocks.validatorspy;

const report = require('..');

const testResourceId = 'test-resource-id';
const oid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';
const sid = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const cid = (p) => p !== 'standard' ? 'UNKNOWN' :
  'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';

// accumulated usage id
const accid = (oid, rid) => 'k/' + oid + '/' + rid + '/UNKNOWN/basic/' +
  'test-metering-plan/test-rating-plan/' +
  'test-pricing-basic/t/0001446418800000';

// resource_instance_id
const rid = '0b39fa70-a65f-4183-bae8-385633ca5c87';

const planReportTemplate = (plan, planUsage, planWindow) =>
  extend(helpers.buildPlanUsage(plan, planUsage), { windows: planWindow });

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

// Convenient test case:
// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = helpers.buildAggregatedUsage(1, 100, 300, {
  consumed: 475200000,
  consuming: 6
}, {
  consumed: 10843200000,
  consuming: 6
}, 1, 3, 45, { price: 0.00014 }, undefined, undefined, undefined, true);

// Space A, consumer B, plan standard/basic/standard/standard
const planBUsage = helpers.buildAggregatedUsage(20, 200, 3000, {
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

      const rated = helpers.ratedTemplate(id, oid, sid, testResourceId,
        1420502400000, 1420502500000,
        1420502500000, helpers.buildAggregatedUsage(21, 300, 3300, {
          consumed: 1108800000,
          consuming: 14
        }, {
          consumed: 25300800000,
          consuming: 14
        }), [
          helpers.buildPlanUsage('basic', planAUsage),
          helpers.buildPlanUsage('standard', planBUsage)
        ], [
          helpers.consumerReferenceTemplate(
            orgid, sid, 'basic', 1420502500000,
           'UNKNOWN'),
          helpers.consumerReferenceTemplate(
            orgid, sid, 'standard', 1420502500000,
           'external:bbeae239-f3f8-483c-9dd0-de6781c38bab')
        ]);

      const consumer1 = helpers.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId, 
        1420502400000, 1420502500000, 'basic',
        helpers.buildAggregatedUsage(1, 100, 300, {
          consumed: 475200000,
          consuming: 6
        }, {
          consumed: 10843200000,
          consuming: 6
        }), [helpers.buildPlanUsage('basic', planAUsage)], 1420502500000);

      const consumer2 = helpers.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId, 
        1420502400000, 1420502500000, 'standard',
        helpers.buildAggregatedUsage(20, 200, 3000, {
          consumed: 633600000,
          consuming: 8
        }, {
          consumed: 14457600000,
          consuming: 8
        }), [helpers.buildPlanUsage('standard', planBUsage)], 1420502500000);

      helpers.storeRatedUsage(rated, () => helpers.storeRatedUsage(consumer1,
        () => helpers.storeRatedUsage(consumer2, done)));
    });

    it('retrieves rated usage for an organization', (done) => {
      // Define the expected usage report
      const planAReport = planReportTemplate('basic', 
        helpers.buildAggregatedUsage(1,
        100, 300, {
          consumed: 475200000,
          consuming: 6
        }, {
          consumed: 10843200000,
          consuming: 6
        }, 1, 3, 45, { price: 0.00014 }, 114, 0.01596, true, true, true),
        helpers.buildWindow(undefined, undefined, undefined,
        undefined, undefined, 49.01596));
      const planBReport = planReportTemplate('standard', 
        helpers.buildAggregatedUsage(
        20, 200, 3000, {
          consumed: 633600000,
          consuming: 8
        }, {
          consumed: 14457600000,
          consuming: 8
        }, 10, 8, 540, { price: 0.00028 }, 152, 0.04256, true, true, true),
        helpers.buildWindow(undefined, undefined, undefined, undefined,
          undefined, 558.04256));

      const consumer1 = consumerReportTemplate('basic', 
        helpers.buildAggregatedUsage(
        undefined, undefined, undefined, undefined,
        undefined,
        1, 3, 45, undefined, undefined, 0.01596, undefined, undefined,
        true), [planAReport], helpers.buildWindow(undefined,
        undefined, undefined, undefined, undefined, 49.01596));
      const consumer2 = consumerReportTemplate('standard',
      helpers.buildAggregatedUsage(
        undefined, undefined, undefined, undefined, undefined,
        10, 8, 540, undefined, undefined, 0.04256, undefined, undefined,
        true), [planBReport], helpers.buildWindow(undefined, undefined,
          undefined, undefined, undefined, 558.04256));

      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';

      const expected = reportTemplate(id, 
        helpers.buildWindow(undefined, undefined,
        undefined, undefined, undefined, 607.05852),
        helpers.buildAggregatedUsage(undefined, undefined, undefined, undefined,
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
          windows: helpers.buildWindow(undefined, undefined, 
            undefined, undefined, undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: helpers.buildAggregatedUsage(undefined, undefined,
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
          windows: helpers.buildWindow(undefined, undefined, undefined,
          undefined, undefined, 607.05852),
          resources: [{
            resource_id: testResourceId,
            aggregated_usage: helpers.buildAggregatedUsage(undefined, undefined,
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
      helpers.storeRatedUsage(require('./json/big-number-rated.json'), () => 
        helpers.storeRatedUsage(require('./json/consumer-1.json'), () =>
        helpers.storeRatedUsage(require('./json/consumer-2.json'), () => 
        helpers.storeRatedUsage(require('./json/consumer-3.json'), () =>
        helpers.storeRatedUsage(require('./json/consumer-4.json'), () => 
        helpers.storeRatedUsage(require('./json/consumer-5.json'), done))))));
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

      const rated = helpers.ratedTemplate(id, orgid, sid, testResourceId,
        1446415200000, 1446415200000,
        1446418800000, [{
          metric: 'memory',
          windows: aggrWindow
        }], [helpers.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], [helpers.consumerReferenceTemplate(
                orgid, sid, 'basic', 1446418800000,'UNKNOWN'),
          helpers.consumerReferenceTemplate(orgid, sid, 'basic',
           1446163200000, 'UNKNOWN2')]);

      const consumer = helpers.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId, 
        1446415200000, 1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [helpers.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446418800000);

      const consumer2 = helpers.ratedConsumerTemplate(
        orgid, sid, cid, testResourceId, 
        446415200000, 1446415200000, 'basic', [{
          metric: 'memory',
          windows: aggrWindow
        }], [helpers.buildPlanUsage('basic', [{
          metric: 'memory',
          windows: planWindow
        }])], 1446163200000, 'UNKNOWN2');

      helpers.storeRatedUsage(rated, () => helpers.storeRatedUsage(consumer,
        () => helpers.storeRatedUsage(consumer2, done)));
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

      const accumulated = helpers.accumulatedTemplate(
        oid, rid, sid, testResourceId,
        helpers.buildAccumulatedUsage({ current: 1 }, { current: 1 },
        { current: 100 }, 1, 0.03, 15,
        undefined, true, undefined));
      helpers.storeAccumulatedUsage(accumulated, done);
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
          accumulated_usage: helpers.buildAccumulatedUsage(1, 1, 
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
            accumulated_usage: helpers.buildAccumulatedUsage(1, 1, 100, 
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

      helpers.storeAccumulatedUsage(accumulated, done);
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
