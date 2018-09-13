'use strict';

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const fixture = require('./fixture');

const carryOverDb = require('../utils/carry-over-db');
const serviceMock = require('../utils/service-mock-util');
const createWait = require('abacus-wait');

const waitUntil = yieldable(createWait().until);

const now = moment.now();
const endOfLastMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();

const carryOverDoc = (id) => ({
  collector_id: id,
  event_guid: `event-guid-${id}`,
  state: 'STARTED',
  timestamp: endOfLastMonth
});

const UNAVAILABLE_FOR_LEGAL_REASONS = 451;
const numberOfSkippableDocsSent = 2;

describe('renewer sends skippable documents', () => {
  let externalSystemsMocks;

  before(
    yieldable.functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.abacusCollectorScopes)
        .return(fixture.abacusCollectorToken);

      externalSystemsMocks.abacusCollector.getUsageService.return.always({
        statusCode: 200,
        body: fixture.usage
          .create()
          .withTimestamp(endOfLastMonth)
          .withCurrentInstances(2)
          .withPreviousInstances(1)
          .build()
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.firstTime(httpStatus.CONFLICT);
      externalSystemsMocks.abacusCollector.collectUsageService.return.secondTime(UNAVAILABLE_FOR_LEGAL_REASONS);

      externalSystemsMocks.startAll();

      yield carryOverDb.setup();
      yield carryOverDb.put(carryOverDoc(1));
      yield carryOverDb.put(carryOverDoc(2));
      fixture.renewer.start(externalSystemsMocks);

      yield waitUntil(
        serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(numberOfSkippableDocsSent));
    })
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('does not record an entry in carry-over', yieldable.functioncb(function*() {
    const docs = yield carryOverDb.readCurrentMonthDocs();
    expect(docs).to.deep.equal([]);
  }));

  it('exposes correct statistics', yieldable.functioncb(function*() {
    const response = yield fixture.renewer.readStats.withValidToken();
    expect(response.statusCode).to.equal(httpStatus.OK);
    const usageStats = response.body.statistics.usage;
    expect(usageStats.report).to.deep.equal({
      success: 0,
      skipped: {
        conflicts: 1,
        legal_reasons: 1
      },
      failures: 0
    });
    expect(omit(usageStats.get, 'missingToken')).to.deep.equal({
      success: numberOfSkippableDocsSent,
      failures: 0
    });
  }));
});
