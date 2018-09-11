'use strict';

// Usage reporting service.

const request = require('abacus-request');
const dbclient = require('abacus-dbclient');

const storage = require('./helper/storage.js');
const mocker = require('./helper/mocker.js');

/* eslint quotes: 1 */

process.env.DB_ACCUMULATOR_URI = process.env.DB_URI;
process.env.DB_AGGREGATOR_URI = process.env.DB_URI;

mocker.mockRequestModule();
mocker.mockClusterModule();

const report = require('..');

const testResourceId = 'test-resource-id';
const accumulatedUsage = {
  id: 'k/org/ins/con/basic/' + 'test-metering-plan/test-rating-plan/' + 'test-pricing-basic/t/0001456185600000',
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
  accumulated_usage: [
    {
      metric: 'memory',
      windows: [
        [null],
        [null],
        [null],
        [null],
        [
          {
            quantity: {
              current: { consuming: 0, consumed: 3628800000 },
              previous: { consuming: 2, consumed: 0 }
            },
            cost: 50803200
          }
        ]
      ]
    }
  ]
};

describe('abacus-usage-report GraphQL', () => {
  let port;

  before((done) => {
    dbclient.drop(process.env.DB_URI, /^abacus-aggregator|^abacus-accumulator/, (err) => {
      if (err) done(err);
      else
        storage.accumulator.put(accumulatedUsage, () => {
          const app = report();
          const server = app.listen(0);
          port = server.address().port;
          done();
        });
    });
  });

  context('when querying complex usage', () => {
    const query = `{
        resource_instance(
          organization_id: "org"
          space_id: "spa"
          consumer_id: "con"
          resource_instance_id: "ins"
          plan_id: "basic"
          metering_plan_id: "test-metering-plan"
          rating_plan_id: "test-rating-plan"
          pricing_plan_id: "test-pricing-basic"
          t: "0001456185600000"
          time: 1456185600000
        ) {
          organization_id
          consumer_id
          resource_instance_id
          plan_id
          accumulated_usage {
            metric
            windows {
              quantity
            }
          }
        }
      }`;
    const expectedReport = {
      resource_instance: {
        organization_id: 'org',
        consumer_id: 'con',
        resource_instance_id: 'ins',
        plan_id: 'basic',
        accumulated_usage: [
          {
            metric: 'memory',
            windows: [
              [null],
              [null],
              [null],
              [null],
              [
                {
                  quantity: {
                    consuming: 0,
                    consumed: 3628800000
                  }
                }
              ]
            ]
          }
        ]
      }
    };

    it('retrieves a report', (done) => {
      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
        {
          p: port,
          query: query
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expectedReport);
          done();
        }
      );
    });
  });

  context('with incorrect query', () => {
    const queryWithoutQuantity = `{
        resource_instance(
          organization_id: "org"
          space_id: "spa"
          consumer_id: "con"
          resource_instance_id: "ins"
          plan_id: "basic"
          metering_plan_id: "test-metering-plan"
          rating_plan_id: "test-rating-plan"
          pricing_plan_id: "test-pricing-basic"
          t: "0001456185600000"
          time: 1456185600000
        ) {
          organization_id
          consumer_id
          resource_instance_id
          plan_id
          accumulated_usage {
            metric
            windows
          }
        }
      }`;

    it('errors', (done) => {
      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
        {
          p: port,
          query: queryWithoutQuantity
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(400);
          expect(val.body.error).to.equal('query');
          expect(val.body.message).to.contain('query error');
          done();
        }
      );
    });
  });

  context('when summary is requested in query', () => {
    const queryWithSummary = `{
        resource_instance(
          organization_id: "org"
          space_id: "spa"
          consumer_id: "con"
          resource_instance_id: "ins"
          plan_id: "basic"
          metering_plan_id: "test-metering-plan"
          rating_plan_id: "test-rating-plan"
          pricing_plan_id: "test-pricing-basic"
          t: "0001456185600000"
          time: 1456185600000
        ) {
          organization_id
          consumer_id
          resource_instance_id
          plan_id
          accumulated_usage {
            metric
            windows {
              summary
            }
          }
        }
      }`;
    const expectedReport = {
      resource_instance: {
        organization_id: 'org',
        consumer_id: 'con',
        resource_instance_id: 'ins',
        plan_id: 'basic',
        accumulated_usage: [
          {
            metric: 'memory',
            windows: [[null], [null], [null], [null], [{ summary: 504 }]]
          }
        ]
      }
    };

    it('calculates it', (done) => {
      request.get(
        'http://localhost::p/v1/metering/aggregated/usage/graph/:query',
        {
          p: port,
          query: queryWithSummary
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expectedReport);
          done();
        }
      );
    });
  });
});
