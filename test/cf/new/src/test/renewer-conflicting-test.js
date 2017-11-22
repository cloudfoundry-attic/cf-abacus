'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

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

const startRenewer = yieldable(renewer.start);
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

describe('when renewer sends conflicting documents', () => {
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

    abacusCollectorMock
      .collectUsageService
      .return
      .always(httpStatus.CONFLICT);

    uaaServerMock.start();
    abacusCollectorMock.start();

    yield carryOverDb.setup();
    yield carryOverDb.put(carryOverDoc);
    yield startRenewer(abacusCollectorMock, uaaServerMock);

    yield waitUntil(serviceMock(abacusCollectorMock.collectUsageService).received(1));
  }));

  after((done) => {
    async.parallel([
      renewer.stop,
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
        conflicts : 1,
        failures : 0
      });
      expect(omit(usageStats.get, 'missingToken')).to.deep.equal({
        success: 1,
        failures : 0
      });
      done(err);
    });
  });
});
