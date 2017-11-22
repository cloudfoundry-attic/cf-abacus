'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');
const omit = _.omit;

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const fixture = require('./fixtures/renewer-fixture');

// FIXME: dynamically calculate this value???
const renewer = require('./fixtures/utils/renewer')({
  SLACK: '32D'
});
const carryOverDb = require('./test-definitions/utils/carry-over-db');
const serviceMock = require('./test-definitions/utils/service-mock-util');
const wait = require('./test-definitions/utils/wait');

const createAbacusCollectorMock = require('./server-mocks/abacus-collector-mock');
const createUAAServerMock = require('./server-mocks/uaa-server-mock');

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';

const waitUntil = yieldable(wait.until);

const now = moment.now();
const eventTimestamp = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();

const carryOverDoc = {
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'STARTED',
  timestamp: eventTimestamp
};

describe('when renewer sends usage, but abacus is down', () => {
  let uaaServerMock;
  let abacusCollectorMock;

  before(yieldable.functioncb(function *() {
    uaaServerMock = createUAAServerMock();
    abacusCollectorMock = createAbacusCollectorMock();

    uaaServerMock
      .tokenService
      .whenScopes(abacusCollectorScopes)
      .return(abacusCollectorToken);

    abacusCollectorMock
      .getUsageService
      .return
      .always({
        statusCode: 200,
        body: fixture.usage.create()
          .withTimestamp(eventTimestamp)
          .withCurrentInstances(2)
          .withPreviousInstances(1)
          .build()
      });

    abacusCollectorMock.collectUsageService.return.always(httpStatus.BAD_GATEWAY);

    uaaServerMock.start();
    abacusCollectorMock.start();

    yield carryOverDb.setup();
    yield carryOverDb.put(carryOverDoc);
    renewer.start(abacusCollectorMock, uaaServerMock);

    // Event reporter (abacus-client) will retry 'fixture.env.retryCount'
    // times to report usage to abacus.
    yield waitUntil(
      serviceMock(
        abacusCollectorMock.collectUsageService
      ).received(renewer.env.retryCount + 1));
  }));

  after((done) => {
    renewer.stop();
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
    renewer.readStats((err, response) => {
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
