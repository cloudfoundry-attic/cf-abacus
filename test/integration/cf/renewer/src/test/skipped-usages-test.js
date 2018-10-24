'use strict';

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const moment = require('abacus-moment');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const fixture = require('./fixture');

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

  before(async () => {
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

    await carryOverDb.setup();
    await carryOverDb.put(carryOverDoc(1));
    await carryOverDb.put(carryOverDoc(2));
    fixture.renewer.start(externalSystemsMocks);

    await eventually(
      serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(numberOfSkippableDocsSent)
    );
  }
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('does not record an entry in carry-over', async () => {
    const docs = await carryOverDb.readCurrentMonthDocs();
    expect(docs).to.deep.equal([]);
  });

  it('exposes correct statistics', async () => {
    const response = await fixture.renewer.readStats.withValidToken();
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
  });
});
