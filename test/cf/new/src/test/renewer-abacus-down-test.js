'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');
const omit = _.omit;

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const fixture = require('./fixtures/renewer-fixture');

const carryOverDb = require('./test-definitions/utils/carry-over-db');
const serviceMock = require('./test-definitions/utils/service-mock-util');
const wait = require('./test-definitions/utils/wait');

const createAbacusCollectorMock = require('./server-mocks/abacus-collector-mock');
const createUAAServerMock = require('./server-mocks/uaa-server-mock');

const waitUntil = yieldable(wait.until);

const now = moment.now();
const endOfLasMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();

const carryOverDoc = {
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'STARTED',
  timestamp: endOfLasMonth
};

describe('when renewer sends usage, but abacus is down', () => {
  let uaaServerMock;
  let abacusCollectorMock;

  before(yieldable.functioncb(function *() {
    uaaServerMock = createUAAServerMock();
    abacusCollectorMock = createAbacusCollectorMock();

    uaaServerMock
      .tokenService
      .whenScopes(fixture.abacusCollectorScopes)
      .return(fixture.abacusCollectorToken);

    abacusCollectorMock
      .getUsageService
      .return
      .always({
        statusCode: 200,
        body: fixture.usage.create()
          .withTimestamp(endOfLasMonth)
          .withCurrentInstances(2)
          .withPreviousInstances(1)
          .build()
      });

    abacusCollectorMock.collectUsageService.return.always(httpStatus.BAD_GATEWAY);

    uaaServerMock.start();
    abacusCollectorMock.start();

    yield carryOverDb.setup();
    yield carryOverDb.put(carryOverDoc);
    fixture.renewer.start(abacusCollectorMock, uaaServerMock);

    // Event reporter (abacus-client) will retry 'fixture.env.retryCount' + 1
    // times to report usage to abacus. After that it will give up.
    yield waitUntil(
      serviceMock(
        abacusCollectorMock.collectUsageService
      ).received(fixture.renewer.env.retryCount + 1));
  }));

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    async.parallel([
      uaaServerMock.stop,
      abacusCollectorMock.stop
    ], done);
  });

  it('does not record an entry in carry-over', yieldable.functioncb(function *() {
    const docs = yield carryOverDb.readCurrentMonthDocs();
    expect(docs).to.deep.equal([]);
  }));

  it('exposes correct statistics', (done) => {
    fixture.renewer.readStats((err, response) => {
      expect(response.statusCode).to.equal(httpStatus.OK);
      const usageStats = response.body.renewer.statistics.usage;
      expect(usageStats.report).to.deep.equal({
        success: 0,
        conflicts : 0,
        failures : 1
      });
      expect(omit(usageStats.get, 'missingToken')).to.deep.equal({
        success: 1,
        failures : 0
      });
      done(err);
    });
  });
});
