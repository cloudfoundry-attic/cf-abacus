'use strict';

// Usage accumulator service.
/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

const util = require('util');

const httpStatus = require('http-status-codes');
const { map, extend } = require('underscore');

const dbclient = require('abacus-dbclient');
const cluster = require('abacus-cluster');
const request = require('abacus-request');

const debug = require('abacus-debug')('abacus-usage-accumulator-previous-month-test');

const { meteredUsageBody } = require('./fixtures');

/* eslint handle-callback-err: 0 */

const testEnv = {
  db: process.env.DB
};

describe('abacus-usage-accumulator-previous-month', () => {
  let clock;
  let accumulator;
  let postStub;
  let server;

  const mockCluster = () => {
    require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster, {
      single: spy()
    });
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
    const app = accumulator(() => {
    });
    server = app.listen(0);
    debug(`previous month: accumulator started on port ${server.address().port}`);
  };

  before((done) => {
    process.env.AGGREGATOR = 'http://localhost:9300';
    process.env.SLACK = '2D';

    mockCluster();

    postStub = sinon.stub(request, 'batch_post');

    setUpTime();

    setUpAccumulator();

    dbclient.drop(testEnv.db, /^abacus-accumulator-/, done);
  });

  after(() => {
    clock.restore();
    postStub.reset();
    server.close();
  });

  context('when usage from previous month is sent', () => {
    const endOfOctoberTimestamp = 1446249600000; // 2015-10-31 00:00:00
    const octoberTimestamp = 1446163200000; // 2015-10-30 00:00:00
    const beginningOfNovemberTimestamp = 1446342121000; // 2015-11-01 01:42:01

    const octoberMetricQuantity = 2;
    const novemberMetricQuantity = 5;

    const checkOctoberWindows = (accumulatedUsage) => {

      const dailyOctoberQuantity = {
        quantity: {
          current: octoberMetricQuantity
        }
      };

      const monthlyOctoberQuantity = {
        quantity: {
          current: octoberMetricQuantity * 2,
          previous: octoberMetricQuantity
        }
      };

      const expectedMetricAccumulatedUsage = [
        [null],
        [null],
        [null],
        [dailyOctoberQuantity, dailyOctoberQuantity, null],
        [monthlyOctoberQuantity, null]
      ];

      expect(accumulatedUsage[0].windows).to.deep.equal(expectedMetricAccumulatedUsage);
    };

    const checkNovemberWindows = (accumulatedUsage) => {

      const novemberQuantity = {
        quantity: {
          current: novemberMetricQuantity
        }
      };

      const expectedMetricAccumulatedUsage = [
        [null],
        [null],
        [null],
        [novemberQuantity, null, null],
        [novemberQuantity, null]
      ];

      expect(accumulatedUsage[0].windows).to.deep.equal(expectedMetricAccumulatedUsage);
    };

    const checkTimestampInId = (id) => {
      const lastSeptemberTimestamp = Date.UTC(2015, 9, 1) - 1;
      const firstNovemberTimestamp = Date.UTC(2015, 10, 1);

      const determiningPartitionId = parseInt(id.split('/').pop().split('-')[0]);

      const errorMessage = 'usage document timestamp in id is not in previous month -> ' +
        'usage will be persisted in wrong db partition';

      expect(determiningPartitionId, errorMessage).to.be.above(lastSeptemberTimestamp);
      expect(determiningPartitionId, errorMessage).to.be.below(firstNovemberTimestamp);
    };

    it('is stored in previous month DB', (done) => {

      const postUsage = (usage) => {
        request.post(
          `http://localhost:${server.address().port}/v1/metering/metered/usage`,
          { body: usage },
          (err, val) => {
            expect(err, util.format('Error %o, body %o', err, val ? val.body : undefined)).to.equal(undefined);
            expect(val.statusCode).to.equal(httpStatus.CREATED);
          });
      };

      postStub
        .onFirstCall().callsFake((requests, cb) => {
          debug('previous month: posting new October usage');
          postUsage(meteredUsageBody(octoberTimestamp, octoberMetricQuantity));

          cb(undefined, [[undefined, { statusCode: httpStatus.CREATED }]]);

        })
        .onSecondCall().callsFake((requests, cb) => {
          map(requests, (req) => {
            debug('previous month: verifying accumulated October usage %o', req);
            checkOctoberWindows(req[1].body.accumulated_usage);
            checkTimestampInId(req[1].body.id);
          });
          debug('previous month: posting November usage');
          postUsage(meteredUsageBody(beginningOfNovemberTimestamp, novemberMetricQuantity));

          cb(undefined, [[undefined, { statusCode: httpStatus.CREATED }]]);

        })
        .onThirdCall().callsFake((requests, cb) => {
          map(requests, (req) => {
            debug('previous month: verifying accumulated November usage %o', req);
            checkNovemberWindows(req[1].body.accumulated_usage);
          });
          debug('previous month: finished successfully');

          cb(undefined, [[undefined, { statusCode: httpStatus.CREATED }]]);

          done();
        });

      debug('previous month: starting usage POST requests ...');
      postUsage(meteredUsageBody(endOfOctoberTimestamp, octoberMetricQuantity));
    });
  });
});
