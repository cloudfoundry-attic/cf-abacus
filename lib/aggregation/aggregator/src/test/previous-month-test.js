'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */

const request = require('abacus-request');
const dbclient = require('abacus-dbclient');

const httpStatus = require('http-status-codes');

const { accumulatedUsageBody } = require('./fixtures');

describe('abacus-usage-aggregator-previous-month', () => {

  let sandbox;

  let clock;
  let aggregator;
  let server;
  let postStub;

  const stubCluster = () => {
    const clusterStub = stubModule('abacus-cluster');
    clusterStub.stubMainFunc((fn) => fn);
  };

  const setUpClock = (time) => {
    if (clock)
      clock.restore();
    clock = sandbox.useFakeTimers({
      now: time,
      toFake: ['Date']
    });
  };

  const cleanUpSeqId = () => {
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../lib/aggregator-config.js')];
    delete require.cache[require.resolve('abacus-seqid')];
  };

  const startAggregator = () => {
    aggregator = require('..');
    const app = aggregator(() => {});
    server = app.listen(0);
  };

  before(() => {
    process.env.SINK = 'http://localhost:9400';
    delete process.env.SAMPLING;
    stubCluster();

    sandbox = sinon.createSandbox();
    postStub = sandbox.stub(request, 'batch_post');
  });

  beforeEach((done) => {
    setUpClock(Date.UTC(2015, 9, 31, 2)); // October 31, 2015 2:00:00 AM
    startAggregator();

    dbclient.drop(process.env.DB_URI, /^abacus-aggregator-/, done);
  });

  afterEach(() => {
    sandbox.reset();
    server.close();
    cleanUpSeqId();
  });

  context('when usage from previous month is sent', () => {

    const postUsage = (usage) => {
      request.post(
        'http://localhost::p/v1/metering/accumulated/usage',
        {
          p: server.address().port,
          body: usage
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(httpStatus.CREATED);
        }
      );
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

    const octoberQuantity = 123;
    const novemberQuantity = 456;

    const endOfOctober = 1446249600000;
    const startOfNovember = 1446336000000;

    const currentMonthWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[4][0];

    const previousMonthWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[4][1];

    const currentDayWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[3][0];

    const previousDayWindow = (request) => request.body.resources[0].plans[0].aggregated_usage[0].windows[3][1];

    it('is stored in previous month DB', (done) => {
      postStub
        .onFirstCall().callsFake((requests, cb) => {

          const request = requests[0][1];

          checkTimestampInId(request.body.id);
          expect(currentMonthWindow(request).quantity).to.equal(octoberQuantity);

          setUpClock(Date.UTC(2015, 10, 1, 21)); // November 1, 2015 11:00:00 PM)

          postUsage(accumulatedUsageBody(startOfNovember, novemberQuantity));
          cb(undefined,
            [[undefined, { statusCode: httpStatus.CREATED }], [undefined, { statusCode: httpStatus.CREATED }]]);
        })
        .onSecondCall().callsFake((requests, cb) => {

          const request = requests[0][1];

          expect(previousMonthWindow(request)).to.be.null;
          expect(previousDayWindow(request)).to.be.null;

          expect(currentMonthWindow(request).quantity).to.equal(novemberQuantity);
          expect(currentMonthWindow(request).previous_quantity).to.be.null;

          expect(currentDayWindow(request).quantity).to.equal(novemberQuantity);
          expect(currentDayWindow(request).previous_quantity).to.be.null;
          cb(undefined,
            [[undefined, { statusCode: httpStatus.CREATED }], [undefined, { statusCode: httpStatus.CREATED }]]);
          done();
        });

      postUsage(accumulatedUsageBody(endOfOctober, octoberQuantity));
    });

    it('gets aggregated properly', (done) => {

      postStub
        .onFirstCall().callsFake((requests, cb) => {

          const request = requests[0][1];

          checkTimestampInId(request.body.id);
          expect(currentMonthWindow(request).quantity).to.equal(octoberQuantity);
          expect(currentMonthWindow(request).previous_quantity).to.be.null;

          setUpClock(Date.UTC(2015, 10, 1, 22)); // November 1, 2015 11:00:00 PM)
          postUsage(accumulatedUsageBody(endOfOctober + 123, novemberQuantity));
          cb(undefined,
            [[undefined, { statusCode: httpStatus.CREATED }], [undefined, { statusCode: httpStatus.CREATED }]]);
        })
        .onSecondCall().callsFake((requests, cb) => {

          const request = requests[0][1];

          expect(previousMonthWindow(request)).to.be.null;
          expect(previousDayWindow(request)).to.be.null;

          checkTimestampInId(request.body.id);

          expect(currentMonthWindow(request).quantity).to.equal(octoberQuantity + novemberQuantity);
          expect(currentMonthWindow(request).previous_quantity).to.equal(octoberQuantity);

          expect(currentDayWindow(request).quantity).to.equal(octoberQuantity + novemberQuantity);
          expect(currentDayWindow(request).previous_quantity).to.equal(octoberQuantity);

          cb(undefined,
            [[undefined, { statusCode: httpStatus.CREATED }], [undefined, { statusCode: httpStatus.CREATED }]]);
          done();
        });

      postUsage(accumulatedUsageBody(endOfOctober, octoberQuantity));
    });
  });
});
