'use strict';

const async = require('async');
const util = require('util');

const { map, extend } = require('underscore');

const moment = require('abacus-moment');

// Set the date @ 3rd day of the month to avoid end/start of month failures
const thirdDayInMillis = moment.utc().startOf('month').add(3, 'days').valueOf();
process.env.ABACUS_TIME_OFFSET = thirdDayInMillis - moment.now();
delete require.cache[require.resolve('abacus-moment')];

const batch = require('abacus-batch');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');
const seqid = require('abacus-seqid');

const builder = require('./helper/builder.js');
const storage = require('./helper/storage.js');
const mocker = require('./helper/mocker.js');
const brequest = batch(request);

process.env.MAX_INTERNAL_INFLIGHT = 10;

mocker.mockRequestModule();
const oauthMocks = mocker.mockOAuthModule();
const validatorspy = oauthMocks.validatorspy;

let report = require('..');

const resourceId = '0b39fa70-a65f-4183-bae8-385633ca5c87';
const testResourceId = 'test-resource-id';
const oid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';
const sid = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const cid = (planName) => planName !== 'standard' ? 'UNKNOWN' : 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';

const consumerReportTemplate = (planId, aggregatedUsage, plans) => ({
  consumer_id: cid(planId),
  resources: [
    {
      resource_id: testResourceId,
      aggregated_usage: aggregatedUsage,
      plans: plans
    }
  ]
});

const spaceReportTemplate = (aggregatedUsage, plans, consumers) => [
  {
    space_id: sid,
    resources: [
      {
        resource_id: testResourceId,
        aggregated_usage: aggregatedUsage,
        plans: plans
      }
    ],
    consumers: consumers
  }
];

const reportTemplate = (id, aggregatedUsage, plans, consumers) => ({
  id: id,
  organization_id: oid,
  account_id: '1234',
  start: 1420502400000,
  end: 1420502500000,
  processed: 1420502500000,
  resources: [
    {
      resource_id: testResourceId,
      aggregated_usage: aggregatedUsage,
      plans: plans
    }
  ],
  spaces: spaceReportTemplate(aggregatedUsage, plans, consumers)
});

// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = builder.buildAggregatedUsage({
  storage: 1,
  lightCalls: 100,
  heavyCalls: 300,
  dailyMemory: { consumed: 475200000, consuming: 6 },
  monthlyMemory: { consumed: 10843200000, consuming: 6 },
  addSummary: true
});

// Space A, consumer B, plan standard/basic/standard/standard
const planBUsage = builder.buildAggregatedUsage({
  storage: 20,
  lightCalls: 200,
  heavyCalls: 3000,
  dailyMemory: { consumed: 633600000, consuming: 8 },
  monthlyMemory: { consumed: 14457600000, consuming: 8 },
  addSummary: true
});

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-usage-report', () => {
  before((done) => {
    dbclient.drop(dbEnv, /^abacus-aggregator|^abacus-accumulator/, done);
  });

  context('when rated usage contains small numbers', () => {
    before((done) => {
      // Doc id
      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';
      const orgid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';

      const rated = builder.ratedTemplate(
        id,
        oid,
        sid,
        testResourceId,
        1420502400000,
        1420502500000,
        1420502500000,
        builder.buildAggregatedUsage({
          storage: 21,
          lightCalls: 300,
          heavyCalls: 3300,
          dailyMemory: { consumed: 1108800000, consuming: 14 },
          monthlyMemory: { consumed: 25300800000, consuming: 14 },
          addSummary: true
        }),
        [builder.buildPlanUsage('basic', planAUsage), builder.buildPlanUsage('standard', planBUsage)],
        [
          builder.consumerReferenceTemplate(1420502500000, 'UNKNOWN'),
          builder.consumerReferenceTemplate(1420502500000, 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab')
        ]
      );

      const consumer1 = builder.ratedConsumerTemplate(
        orgid,
        sid,
        cid,
        testResourceId,
        1420502400000,
        1420502500000,
        'basic',
        builder.buildAggregatedUsage({
          storage: 1,
          lightCalls: 100,
          heavyCalls: 300,
          dailyMemory: { consumed: 475200000, consuming: 6 },
          monthlyMemory: { consumed: 10843200000, consuming: 6 },
          addSummary: true
        }),
        [builder.buildPlanUsage('basic', planAUsage)],
        1420502500000
      );

      const consumer2 = builder.ratedConsumerTemplate(
        orgid,
        sid,
        cid,
        testResourceId,
        1420502400000,
        1420502500000,
        'standard',
        builder.buildAggregatedUsage({
          storage: 20,
          lightCalls: 200,
          heavyCalls: 3000,
          dailyMemory: { consumed: 633600000, consuming: 8 },
          monthlyMemory: { consumed: 14457600000, consuming: 8 },
          addSummary: true
        }),
        [builder.buildPlanUsage('standard', planBUsage)],
        1420502500000
      );

      storage.aggregator.put(rated, () =>
        storage.aggregator.put(consumer1, () => storage.aggregator.put(consumer2, done))
      );
    });

    context('retrieves rated usage for an organization', () => {
      let expected;
      const url = 'http://localhost::p/v1/metering/organizations/:organization_id/aggregated/usage/:time';
      const time = 1420574400000;

      const verify = (secured, cb) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.resetHistory();

        const app = report();
        const server = app.listen(0);

        request.get(
          url,
          {
            p: server.address().port,
            organization_id: oid,
            time: time
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            cb();
          }
        );
      };

      before(() => {
        const planAReport = builder.buildPlanUsage(
          'basic',
          builder.buildAggregatedUsage({
            storage: 1,
            lightCalls: 100,
            heavyCalls: 300,
            dailyMemory: { consumed: 475200000, consuming: 6 },
            monthlyMemory: { consumed: 10843200000, consuming: 6 },
            summarizedMemory: 114,
            addSummary: true
          })
        );
        const planBReport = builder.buildPlanUsage(
          'standard',
          builder.buildAggregatedUsage({
            storage: 20,
            lightCalls: 200,
            heavyCalls: 3000,
            dailyMemory: { consumed: 633600000, consuming: 8 },
            monthlyMemory: { consumed: 14457600000, consuming: 8 },
            summarizedMemory: 152,
            addSummary: true
          })
        );

        const consumer1 = consumerReportTemplate(
          'basic',
          builder.buildAggregatedUsage({
            storage: 1,
            lightCalls: 100,
            heavyCalls: 300,
            dailyMemory: 0,
            monthlyMemory: 0,
            summarizedMemory: 114,
            addSummary: true
          }),
          [planAReport]
        );
        const consumer2 = consumerReportTemplate(
          'standard',
          builder.buildAggregatedUsage({
            storage: 20,
            lightCalls: 200,
            heavyCalls: 3000,
            dailyMemory: 0,
            monthlyMemory: 0,
            summarizedMemory: 152,
            addSummary: true
          }),
          [planBReport]
        );

        const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000';

        expected = reportTemplate(
          id,
          builder.buildAggregatedUsage({
            storage: 21,
            lightCalls: 300,
            heavyCalls: 3300,
            dailyMemory: 0,
            monthlyMemory: 0,
            summarizedMemory: 266,
            addSummary: true
          }),
          [planAReport, planBReport],
          [consumer1, consumer2]
        );
      });

      it('succeeds when throttle limit is not exceeded', (done) => {
        verify(false, () => verify(true, done));
      });

      context('when throttle limit is exceeded', () => {
        before(() => {
          process.env.THROTTLE = 10;
          delete require.cache[require.resolve('..')];
          report = require('..');
        });

        it('succeeds', (done) => {
          let cbs = 0;
          const cb = () => {
            if (++cbs === 15) done();
          };

          for (let i = 0; i < 15; i++) verify(false, () => verify(true, cb));
        });
      });
    });

    const expectedResources = [
      {
        resource_id: testResourceId,
        plans: [
          {
            plan_id: 'basic/test-metering-plan/test-rating-plan/test-pricing-basic',
            aggregated_usage: builder.buildAggregatedUsage({
              storage: 1,
              lightCalls: 100,
              heavyCalls: 300,
              dailyMemory: { consumed: 475200000, consuming: 6 },
              monthlyMemory: { consumed: 10843200000, consuming: 6 },
              summarizedMemory: 114,
              addSummary: true
            })
          },
          {
            plan_id: 'standard/test-metering-plan/test-rating-plan-standard/test-pricing-standard',
            aggregated_usage: builder.buildAggregatedUsage({
              storage: 20,
              lightCalls: 200,
              heavyCalls: 3000,
              dailyMemory: { consumed: 633600000, consuming: 8 },
              monthlyMemory: { consumed: 14457600000, consuming: 8 },
              summarizedMemory: 152,
              addSummary: true
            })
          }
        ]
      }
    ];

    it('queries summarized usage for an organization', (done) => {
      const query = `{
        organization(organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420574400000) {
          organization_id,
          resources {
            resource_id,
            plans {
              plan_id
              aggregated_usage {
                metric,
                windows {
                  quantity,
                  summary
                }
              }
            }
          }
        }
      }`;

      const expected = {
        organization: {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          resources: expectedResources
        }
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.resetHistory();

        const app = report();
        const server = app.listen(0);

        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
          {
            p: server.address().port,
            query: query
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode, util.format('Bad response %o', val.body)).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);

            done();
          }
        );
      };

      verify(false, () => verify(true, done));
    });

    it('queries rated usage using GraphQL queries', (done) => {
      const query = `{
        organizations(organization_ids: ["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], time: 1420574400000) {
          organization_id,
          resources {
            resource_id,
            plans {
              plan_id
              aggregated_usage {
                metric,
                windows {
                  quantity,
                  summary
                }
              }
            }
          }
        }
      }`;

      const expected = {
        organizations: [
          {
            organization_id: oid,
            resources: expectedResources
          }
        ]
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.resetHistory();

        const app = report();
        const server = app.listen(0);

        const getRatedUsageRequest = (requestDone) => {
          brequest.get(
            'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
            {
              p: server.address().port,
              query: query
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
              expect(val.body).to.deep.equal(expected);
              requestDone();
            }
          );
        };

        const unauthorizedQueries = [
          '{ organizations(organization_ids: ' +
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
            'aggregated_usage { metric, windows { charge }}}}}'
        ];

        const unauthorizedRequests = map(unauthorizedQueries, (uquery) => {
          return (requestDone) => {
            brequest.get(
              'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
              {
                headers: {
                  authorization: 'Bearer test'
                },
                p: server.address().port,
                query: uquery
              },
              (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(400);
                expect(val.body.error).to.contain('query');
                requestDone();
              }
            );
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
                storage.aggregator.put(require('./json/consumer-5.json'), done)
              )
            )
          )
        )
      );
    });

    it('retrieves rated usage with 16 significant digits', (done) => {
      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.resetHistory();

        const app = report();
        const server = app.listen(0);

        request.get(
          'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
          {
            p: server.address().port,
            organization_id: usage.organization_id,
            time: '1448878436000'
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body.spaces.length).to.equal(5);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
            done();
          }
        );
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
        [
          {
            quantity: {
              consumed: 158400000,
              consuming: 1
            },
            previous_quantity: null
          },
          {
            quantity: {
              consumed: 172800000,
              consuming: 2
            }
          },
          { quantity: 0 }
        ],
        [
          {
            quantity: {
              consumed: 158400000,
              consuming: 1
            },
            previous_quantity: null
          },
          {
            quantity: {
              consumed: -5011200000,
              consuming: 2
            }
          }
        ]
      ];

      const aggrWindow = [
        [
          {
            quantity: 0,
            previous_quantity: null
          }
        ],
        [
          {
            quantity: 0,
            previous_quantity: null
          }
        ],
        [
          {
            quantity: 0,
            previous_quantity: null
          }
        ],
        [
          {
            quantity: {
              consumed: 158400000,
              consuming: 1
            },
            previous_quantity: null
          },
          {
            quantity: {
              consumed: 172800000,
              consuming: 2
            }
          },
          { quantity: 0 }
        ],
        [
          {
            quantity: {
              consumed: 158400000,
              consuming: 1
            },
            previous_quantity: null
          },
          {
            quantity: {
              consumed: -5011200000,
              consuming: 2
            }
          }
        ]
      ];

      const id = 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29/t/0001446418800000';
      const orgid = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29';

      const endOfOctober = moment.utc('2015-10-30T00:00:00.000Z').valueOf();
      const november22h = moment.utc('2015-11-01T22:00:00.000Z').valueOf();
      const november23h = moment.utc('2015-11-01T23:00:00.000Z').valueOf();

      const rated = builder.ratedTemplate(
        id,
        orgid,
        sid,
        testResourceId,
        november22h,
        november22h,
        november23h,
        [
          {
            metric: 'memory',
            windows: aggrWindow
          }
        ],
        [
          builder.buildPlanUsage('basic', [
            {
              metric: 'memory',
              windows: planWindow
            }
          ])
        ],
        [
          builder.consumerReferenceTemplate(november23h, 'UNKNOWN'),
          builder.consumerReferenceTemplate(endOfOctober, 'UNKNOWN2')
        ]
      );

      const consumer = builder.ratedConsumerTemplate(
        orgid,
        sid,
        cid,
        testResourceId,
        november22h,
        november22h,
        'basic',
        [
          {
            metric: 'memory',
            windows: aggrWindow
          }
        ],
        [
          builder.buildPlanUsage('basic', [
            {
              metric: 'memory',
              windows: planWindow
            }
          ])
        ],
        november23h
      );

      const consumer2 = builder.ratedConsumerTemplate(
        orgid,
        sid,
        cid,
        testResourceId,
        november22h,
        november22h,
        'basic',
        [
          {
            metric: 'memory',
            windows: aggrWindow
          }
        ],
        [
          builder.buildPlanUsage('basic', [
            {
              metric: 'memory',
              windows: planWindow
            }
          ])
        ],
        endOfOctober,
        'UNKNOWN2'
      );

      storage.aggregator.put(rated, () =>
        storage.aggregator.put(consumer, () =>
          storage.aggregator.put(consumer2, done))
      );
    });

    it('checks that time-based resource uses its bounds', (done) => {

      const expectedDay = {
        summary: 48,
        quantity: {
          consumed: 172800000,
          consuming: 2
        }
      };

      const expectedMonth = {
        summary: 48,
        quantity: {
          consumed: -5011200000,
          consuming: 2
        }
      };

      const checkResourcesWindows = (resources, expectedDay, expectedMonth) => {
        const aggregatedUsage = resources[0].plans[0].aggregated_usage[0];
        expect(aggregatedUsage.windows[3][2]).to.deep.equal(expectedDay);
        expect(aggregatedUsage.windows[4][1]).to.deep.equal(expectedMonth);
      };

      const app = report();
      const server = app.listen(0);

      request.get('http://localhost::p/v1/metering/organizations/:organization_id/aggregated/usage/:time', {
        p: server.address().port,
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29',
        time: moment.utc('2015-11-02T00:00:00.000Z').valueOf()
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        // Expect the october window value to be based in october only
        checkResourcesWindows(val.body.resources, expectedDay, expectedMonth);
        checkResourcesWindows(val.body.spaces[0].consumers[0].resources, expectedDay, expectedMonth);

        // Expect UNKNOWN2's day windows to be null and month window shifted
        expect(val.body.spaces[0].consumers[1].resources[0].plans[0].aggregated_usage[0].windows[3][0]).to.equal(null);
        expect(val.body.spaces[0].consumers[1].resources[0].plans[0].aggregated_usage[0].windows[3][1]).to.equal(null);
        expect(val.body.spaces[0].consumers[1].resources[0].plans[0].aggregated_usage[0].windows[4][0]).to.equal(null);

        done();
      });
    });
  });

  context('when accumulated usage has small numbers', () => {
    const generateAccumulatedUsageId = (oid, rid) =>
      `k/${oid}/${rid}/UNKNOWN/basic/test-metering-plan/test-rating-plan/test-pricing-basic/t/0001446418800000`;

    let server;
    beforeEach(() => {
      server = report().listen(0);
    });

    before((done) => {
      const accumulated = builder.accumulatedTemplate(
        oid,
        resourceId,
        sid,
        testResourceId,
        builder.buildAccumulatedUsage({
          storage: { current: 1 },
          lightCalls: { current: 1 },
          heavyCalls: { current: 100 },
          addSummary: true
        })
      );
      storage.accumulator.put(accumulated, done);
    });

    it('retrieves accumulated usage', (done) => {
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
        accumulated_usage: builder.buildAccumulatedUsage({
          storage: 1,
          lightCalls: 1,
          heavyCalls: 100,
          addSummary: true
        })
      };

      request.get(
        'http://localhost::p/v1/metering/organizations/:organization_id/' +
          'spaces/:space_id/resource_id/:resource_id/' +
          'resource_instances/:resource_instance_id/' +
          'consumers/:consumer_id/plans/:plan_id/' +
          'metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
          'pricing_plans/:pricing_plan_id/t/:t/aggregated/usage/:time',
        {
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
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.body).to.deep.equal(expected);
          done();
        }
      );
    });

    it('retrieves accumulated usage using a GraphQL query', (done) => {
      const query = `{
        resource_instance(
          organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
          space_id: "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
          consumer_id: "UNKNOWN",
          resource_instance_id: "0b39fa70-a65f-4183-bae8-385633ca5c87",
          plan_id: "basic",
          metering_plan_id: "test-metering-plan",
          rating_plan_id: "test-rating-plan",
          pricing_plan_id: "test-pricing-basic",
          t: "0001446418800000",
          time: 1446418800000
        ) {
          organization_id,
          consumer_id,
          resource_instance_id,
          plan_id,
          accumulated_usage {
            metric,
            windows {
              quantity,
              summary
            }
          }
        }
      }`;

      const expected = {
        resource_instance: {
          organization_id: oid,
          consumer_id: 'UNKNOWN',
          resource_instance_id: resourceId,
          plan_id: 'basic',
          accumulated_usage: builder.buildAccumulatedUsage({
            storage: 1,
            lightCalls: 1,
            heavyCalls: 100,
            addSummary: true
          })
        }
      };

      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
        {
          p: server.address().port,
          query: query
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expected);

          done();
        }
      );
    });
  });

  context('when accumulated usage has unknown metric', () => {
    let server;

    before((done) => {
      dbclient.drop(dbEnv, /^abacus-aggregator|^abacus-accumulator/, () => {
        server = report().listen(0);

        const accumulatedUsage = builder.buildAccumulatedUsage({
          storage: { current: 1 },
          lightCalls: { current: 1 },
          heavyCalls: { current: 100 },
          addSummary: true
        });
        const badMetric = extend({}, accumulatedUsage[0], {
          metric: 'sampleName',
          windows: [
            [null],
            [null],
            [null],
            [
              {
                quantity: { current: 1 },
                summary: 22.57
              },
              null
            ],
            [
              {
                quantity: { current: 1 },
                summary: 1.234
              },
              null
            ]
          ]
        });
        accumulatedUsage.push(badMetric);

        const accumulated = builder.accumulatedTemplate(
          oid,
          resourceId,
          sid,
          testResourceId,
          accumulatedUsage
        );
        storage.accumulator.put(accumulated, done);
      });
    });

    const expectedAccumulatedUsage = builder.buildAccumulatedUsage(1, 1, 100, 1, 0.03, 15, true, true, true);
    const expectedBadMetric = extend({}, expectedAccumulatedUsage[0], {
      metric: 'sampleName',
      windows: [
        [null],
        [null],
        [null],
        [
          {
            quantity: 1,
            summary: 0
          },
          null
        ],
        [
          {
            quantity: 1,
            summary: 0
          },
          null
        ]
      ]
    });

    it('sets charge and summary to 0', (done) => {
      request.get(
        'http://localhost::p/v1/metering/organizations/:organization_id/' +
        'spaces/:space_id/resource_id/:resource_id/' +
        'resource_instances/:resource_instance_id/' +
        'consumers/:consumer_id/plans/:plan_id/' +
        'metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
        'pricing_plans/:pricing_plan_id/t/:t/aggregated/usage/:time',
        {
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
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.body.accumulated_usage[3]).to.deep.equal(expectedBadMetric);
          done();
        }
      );
    });

    it('sets charge and summary to 0, using a GraphQL query', (done) => {
      const query = `{
        resource_instance(
          organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
          space_id: "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
          consumer_id: "UNKNOWN",
          resource_instance_id: "0b39fa70-a65f-4183-bae8-385633ca5c87",
          plan_id: "basic",
          metering_plan_id: "test-metering-plan",
          rating_plan_id: "test-rating-plan",
          pricing_plan_id: "test-pricing-basic",
          t: "0001446418800000",
          time: 1446418800000
        ) {
          organization_id,
          consumer_id,
          resource_instance_id,
          plan_id,
          accumulated_usage {
            metric,
            windows {
              quantity,
              summary
            }
          }
        }
      }`;

      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
        {
          p: server.address().port,
          query: query
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body.resource_instance.accumulated_usage[3]).to.deep.equal(expectedBadMetric);

          done();
        }
      );
    });
  });

  context('when requesting non-existing usage', () => {
    let server;
    beforeEach(() => {
      server = report().listen(0);
    });

    context('on non-existing organization', () => {
      const test = (done, time) => {
        request.get(
          'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
          {
            p: server.address().port,
            organization_id: 'unexisting',
            time: time
          },
          (err, val) => {
            expect(val.statusCode).to.equal(404);
            done();
          }
        );
      };

      it('returns 404 for specific time', (done) => {
        test(done, 1420574400000);
      });

      it('returns 404 with current time,', (done) => {
        test(done);
      });
    });

    it('on existing org, 200 with missing resources', (done) => {
      request.get(
        'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage',
        {
          p: server.address().port,
          organization_id: 'some-organization'
        },
        (err, val) => {
          expect(val.statusCode).to.equal(200);
          expect(val.body.resources).to.deep.equal([]);
          expect(val.body.spaces).to.deep.equal([]);
          done();
        }
      );
    });

    context('on missing consumer documents', () => {
      const orgid = 'a4d7fe4d-3cb1-5cc3-a831-ffe99e20cf37';
      const consumerProcessedTime = 1420502500000;
      const id = `k/${orgid}/t/${seqid.pad16(consumerProcessedTime)}`;

      const buildRatedUsageFromTemplate = (processedTimeConsumer1, processedTimeConsumer2) =>
        builder.ratedTemplate(
          id,
          orgid,
          sid,
          testResourceId,
          1420502400000,
          1420502500000,
          1420502500000,
          builder.buildAggregatedUsage({
            storage: 21,
            lightCalls: 300,
            heavyCalls: 3300,
            dailyMemory: 0,
            monthlyMemory: 0,
            addSummary: true
          }),
          [builder.buildPlanUsage('basic', planAUsage), builder.buildPlanUsage('standard', planBUsage)],
          [
            builder.consumerReferenceTemplate(processedTimeConsumer1, 'consumer_1'),
            builder.consumerReferenceTemplate(processedTimeConsumer2, 'consumer_2')
          ]
        );

      beforeEach((done) => {
        const consumer1 = builder.ratedConsumerTemplate(
          orgid,
          sid,
          cid,
          testResourceId,
          1420502400000,
          1420502500000,
          'basic',
          builder.buildAggregatedUsage({
            storage: 1,
            lightCalls: 100,
            heavyCalls: 300,
            dailyMemory: 0,
            monthlyMemory: 0,
            addSummary: true
          }),
          [builder.buildPlanUsage('basic', planAUsage)],
          consumerProcessedTime,
          'consumer_1'
        );

        dbclient.drop(dbEnv, /^abacus-aggregator|^abacus-accumulator/, () =>
          storage.aggregator.put(consumer1, done)
        );
      });

      it('returns code 206 when missing consumer time is in the current month', (done) => {
        storage.aggregator.put(buildRatedUsageFromTemplate(consumerProcessedTime, consumerProcessedTime), () => {
          request.get(
            'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
            {
              p: server.address().port,
              organization_id: orgid,
              time: 1420574400000
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(206);
              done();
            }
          );
        });
      });

      it('should skip older consumers', (done) => {
        const endOfPreviousMonth = 1420002500000;

        storage.aggregator.put(buildRatedUsageFromTemplate(consumerProcessedTime, endOfPreviousMonth), () => {
          request.get(
            'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
            {
              p: server.address().port,
              organization_id: orgid,
              time: 1420574400000
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);
              done();
            }
          );
        });
      });
    });

    context('on missing space documents', () => {
      const orgid = 'aaaaaaaa-3cb1-5cc3-a831-bbbb33334444';
      const sid2 = '11111111-2222-3333-4444-555555555555';
      const processedTime = 1420502500000;
      const id = `k/${orgid}/t/${seqid.pad16(processedTime)}`;

      const consumer = builder.ratedConsumerTemplate(
        orgid,
        sid,
        cid,
        testResourceId,
        1420502400000,
        1420502500000,
        'basic',
        builder.buildAggregatedUsage({
          storage: 1,
          lightCalls: 100,
          heavyCalls: 300,
          dailyMemory: 0,
          monthlyMemory: 0,
          addSummary: true
        }),
        [builder.buildPlanUsage('basic', planAUsage)],
        processedTime,
        'consumer'
      );

      beforeEach((done) => {
        dbclient.drop(dbEnv, /^abacus-aggregator|^abacus-accumulator/, () =>
          storage.aggregator.put(consumer, done)
        );
      });

      it('returns code 206 when missing space data', (done) => {
        const data = builder.ratedTemplate(
          id,
          orgid,
          sid,
          testResourceId,
          1420502400000,
          1420502500000,
          1420502500000,
          builder.buildAggregatedUsage({
            storage: 21,
            lightCalls: 300,
            heavyCalls: 3300,
            dailyMemory: 0,
            monthlyMemory: 0,
            addSummary: true
          }),
          [builder.buildPlanUsage('basic', planAUsage)],
          [
            builder.consumerReferenceTemplate(processedTime, 'consumer')
          ]
        );
        data.spaces.push({ space_id: sid2 });

        storage.aggregator.put(data, () => {
          request.get(
            'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
            {
              p: server.address().port,
              organization_id: orgid,
              time: 1420574400000
            },
            (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(206);
              done();
            }
          );
        });
      });
    });

  });

  context('when shifting resource windows', () => {

    let server;

    const orgUsage = (start, end, processed, organizationId, resourceId) => ({
      organization_id: organizationId,
      account_id: '1234',
      start: start,
      end: end,
      processed: processed,
      id: `k/${organizationId}/t/000${start}`,
      consumer_id: 'app:3653384d-4754-4802-a44c-9fd363204660',
      resource_id: resourceId,
      processed_id: `${processed}-4-0-1-0`,
      plan_id: 'basic',
      resources: [
        {
          resource_id: resourceId,
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        }
      ],
      spaces: [
        {
          space_id: 'space1',
          resources: [
            {
              resource_id: resourceId,
              plans: [builder.buildPlanUsage('basic', planAUsage)]
            }
          ],
          consumers: [
            {
              id: 'app:3653384d-4754-4802-a44c-9fd363204660',
              t: '0001502371509001'
            }
          ]
        }
      ]
    });

    const consumerUsage = (start, end, processed, organizationId, resourceId) => ({
      organization_id: organizationId,
      account_id: '1234',
      start: start,
      end: end,
      processed: processed,
      id: `k/${organizationId}/space1/app:3653384d-4754-4802-a44c-9fd363204660/t/0001502371509001`,
      consumer_id: 'app:3653384d-4754-4802-a44c-9fd363204660',
      resource_id: resourceId,
      processed_id: `${processed}-4-0-1-0`,
      plan_id: 'basic',
      resources: [
        {
          resource_id: resourceId,
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        }
      ]
    });

    before(() => {
      process.env.SECURED = 'false';
      const app = report();
      server = app.listen(0);
    });

    after(() => {
      if (server)
        server.close();
      server = null;
    });

    const requestUsage = (organizationId, cb) => {
      request.get(
        'http://localhost::p/v1/metering/organizations/:organization_id/aggregated/usage/:time', {
          p: server.address().port,
          organization_id: organizationId,
          time: moment.now()
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          cb(val.body);
        }
      );
    };

    const expectedDailyWindow = {
      quantity : 1,
      summary : 1
    };

    const checkResourcesWindows = (resources, expectedWindows) => {
      expect(resources.length).to.equal(1);
      expect(resources[0].plans.length).to.equal(1);
      const aggregatedUsage = resources[0].plans[0].aggregated_usage[0];
      expect(aggregatedUsage.windows).to.deep.equal(expectedWindows);
    };

    const requestAndValidateUsage = (organizationId, windows, cb) => {
      requestUsage(organizationId, (body) => {
        expect(body.resources.length).to.equal(1);

        checkResourcesWindows(body.spaces[0].resources, windows);
        checkResourcesWindows(body.spaces[0].consumers[0].resources, windows);

        cb();
      });
    };

    const requestAndValidateNoUsage = (organizationId, cb) => {
      requestUsage(organizationId, (body) => {
        /* eslint no-unused-expressions: 1 */
        expect(body.resources).to.be.empty;
        expect(body.spaces).to.be.empty;

        cb();
      });
    };

    const testResourceId = 'resource-1';

    const populateDB = (start, end, processed, testOrgId, cb) =>
      storage.aggregator.put(orgUsage(start, end, processed, testOrgId, testResourceId), () =>
        storage.aggregator.put(consumerUsage(start, end, processed, testOrgId, testResourceId), cb));

    it('should not get report for usage reported previous month', (done) => {
      const testOrgId = 'shift-org-previous-month';

      const start = moment.utc().startOf('month').subtract(1, 'day').valueOf();
      const end = start + 10;
      const processed = start + 20;

      populateDB(start, end, processed, testOrgId, () =>
        requestAndValidateNoUsage(testOrgId, done)
      );
    });

    it('should not get report for the day, when usage is reported previous day', (done) => {
      const testOrgId = 'shift-org-previous-day';

      const start = moment.utc().startOf('day').subtract(1, 'hour').valueOf();
      const end = start + 10;
      const processed = start + 20;

      const expWindows = [[null], [null], [null], [null, expectedDailyWindow], [expectedDailyWindow, null]];

      populateDB(start, end, processed, testOrgId, () => {
        requestAndValidateUsage(testOrgId, expWindows, done);
      });
    });

    it('should not get report for the day, when usage is reported at the last minute of the previous day', (done) => {
      const testOrgId = 'shift-org-last-minute-previous-day';

      const startOfDay = moment.utc().startOf('day');
      const endOfPreviousDayMillis = startOfDay.subtract(1, 'minute').valueOf();
      const start = endOfPreviousDayMillis;
      const end = endOfPreviousDayMillis + 10;
      const processed = endOfPreviousDayMillis + 20;

      const expWindows = [[null], [null], [null], [null, expectedDailyWindow], [expectedDailyWindow, null]];

      populateDB(start, end, processed, testOrgId, () => {
        requestAndValidateUsage(testOrgId, expWindows, done);
      });
    });

    it('should get report when usage is reported at the beginning of the day', (done) => {
      const testOrgId = 'shift-org-start-of-day';

      const startOfDay = moment.utc().startOf('day').valueOf();
      const start = startOfDay;
      const end = startOfDay + 10;
      const processed = startOfDay + 20;

      const expWindows = [[null], [null], [null], [expectedDailyWindow, null], [expectedDailyWindow, null]];

      populateDB(start, end, processed, testOrgId, () => {
        requestAndValidateUsage(testOrgId, expWindows, done);
      });
    });

    it('should get report when usage is reported now', (done) => {
      const testOrgId = 'shift-org-now';
      const now = moment.now();
      const expWindows = [[null], [null], [null], [expectedDailyWindow, null], [expectedDailyWindow, null]];

      populateDB(now, now, now, testOrgId, () => {
        requestAndValidateUsage(testOrgId, expWindows, done);
      });
    });

  });

});
