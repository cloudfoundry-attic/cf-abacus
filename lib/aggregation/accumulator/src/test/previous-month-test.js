'use strict';

// Usage accumulator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

const { map, extend } = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');

const debug = require('abacus-debug')('abacus-usage-accumulator-previous-month-test');

/* eslint handle-callback-err: 0 */

const testEnv = {
  db: process.env.DB
};

describe('abacus-usage-accumulator-previous-month', () => {
  let clock;
  let accumulator;
  let postSpy;
  let server;

  const mockCluster = () => {
    require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster, {
      single: spy()
    });
  };

  const mockRequest = () => {
    const requestMock = extend({}, request, {
      batch_post: (requests, cb) => postSpy(requests, cb)
    });
    require.cache[require.resolve('abacus-request')].exports = requestMock;
  };

  const setUpTime = () => {
    const novemberFirst = Date.UTC(2015, 10, 1, 23); // 2015-11-01:23:00:00
    clock = sinon.useFakeTimers({
      now: novemberFirst,
      toFake: ['Date']
    });
    debug(`previous month: current time ${new Date(novemberFirst).toUTCString()} ...`);
  };

  const setUpAccumulator = () => {
    accumulator = require('..');
    const app = accumulator(() => {});
    server = app.listen(0);
    debug(`previous month: accumulator started on port ${server.address().port}`);
  };

  before((done) => {
    process.env.AGGREGATOR = 'http://localhost:9300';
    process.env.SLACK = '2D';

    mockCluster();
    mockRequest();

    setUpTime();

    setUpAccumulator();

    dbclient.drop(testEnv.db, /^abacus-accumulator-/, done);
  });

  after(() => {
    clock.restore();
  });

  context('when usage from previous month is sent', () => {
    const endOfOctoberTimestamp = 1446249600000; // 2015-10-31 00:00:00
    const beginningOfNovemberTimestamp = 1446342121000; // 2015-11-01 01:42:01

    const octoberMetricQuantity = 2;
    const novemberMetricQuantity = 5;

    const usageBody = (timestamp, quantity) => ({
      normalized_usage_id: '330',
      start: timestamp,
      end: timestamp,
      collected_usage_id: '555',
      metered_usage_id: '422',
      resource_id: 'test-resource',
      resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      plan_id: 'basic',
      resource_type: 'test',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: 'test-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic',
      prices: {
        metrics: [
          { name: 'storage', price: 1 },
          {
            name: 'thousand_light_api_calls',
            price: 0.03
          },
          { name: 'heavy_api_calls', price: 0.15 },
          { name: 'memory', price: 0.00014 }
        ]
      },
      metered_usage: [
        { metric: 'heavy_api_calls', quantity: quantity }
      ]
    });

    const checkOctoberWindows = (accumulatedUsage) => {

      const previousQuantity = {
        quantity: {
          current: octoberMetricQuantity
        }
      };

      const expectedMetricAccumulatedUsage = [
        [null],
        [null],
        [null],
        [null, previousQuantity, null],
        [null, previousQuantity]
      ];

      expect(accumulatedUsage[0].windows).to.deep.equal(expectedMetricAccumulatedUsage);
    };

    const checkNovemberWindows = (accumulatedUsage) => {

      const previousQuantity = {
        quantity: {
          current: octoberMetricQuantity
        }
      };

      const currentQuantity = {
        quantity: {
          current: novemberMetricQuantity
        }
      };

      const expectedMetricAccumulatedUsage = [
        [null],
        [null],
        [null],
        [currentQuantity, previousQuantity, null],
        [currentQuantity, previousQuantity]
      ];

      expect(accumulatedUsage[0].windows).to.deep.equal(expectedMetricAccumulatedUsage);
    };

    const checkTimestampInId = (id) => {
      const firstOctoberTimestamp = 1443657600; // 2015-10-01 00:00:00
      const lastOctoberTimestamp = 1446335999; // 2015-10-31 23:59:59

      const determiningPartitionId = parseInt(id.split('/').pop().split('-')[0]) / 1000;

      const errorMessage = 't in usage document id is not in previous month ' +
        '-> usage will be persisted in wrong db partition';

      expect(determiningPartitionId, errorMessage).to.be.below(lastOctoberTimestamp);
      expect(determiningPartitionId, errorMessage).to.be.above(firstOctoberTimestamp);
    };

    it('adds usage from previous month in proper window', (done) => {
      let records = 0;

      const postUsage = (usage) => {
        request.post(`http://localhost:${server.address().port}/v1/metering/metered/usage`, {
          body: usage
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
        });
      };

      postSpy = (requests, cb) => {
        records++;

        debug('previous month: POST request %d %o', records, requests);

        if (records === 1) {
          map(requests, (req) => {
            debug('previous month: verifying accumulated usage %o', req);
            checkOctoberWindows(req[1].body.accumulated_usage);
            checkTimestampInId(req[1].body.id);
          });
          postUsage(usageBody(beginningOfNovemberTimestamp, novemberMetricQuantity));
        }

        if (records === 2) {
          map(requests, (req) => {
            debug('previous month: verifying accumulated usage %o', req);
            checkNovemberWindows(req[1].body.accumulated_usage);
          });
          debug('previous month: finished successfully');
          done();
        }

        cb(undefined, [[undefined, { statusCode: 201 }]]);
      };

      debug('previous month: starting usage POST requests ...');
      postUsage(usageBody(endOfOctoberTimestamp, octoberMetricQuantity));
    });
  });
});
