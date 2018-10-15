'use strict';

/* eslint-disable max-len */

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const yieldable = require('abacus-yieldable');
const moment = require('abacus-moment');
const createWait = require('abacus-wait');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const fixture = require('./fixture');

const waitUntil = yieldable(createWait().until);

const now = moment.now();
const startOfCurrentMonth = moment
  .utc(now)
  .startOf('month')
  .valueOf();
const startOfLastMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .startOf('month')
  .valueOf();
const endOfLastMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();
const middleOfLastMonth = Math.floor((startOfLastMonth + endOfLastMonth) / 2);

const outOfSlackCarryOverDoc = {
  collector_id: 0,
  event_guid: 'event-guid-0',
  state: 'STARTED',
  timestamp: moment
    .utc(startOfLastMonth)
    .subtract(100, 'days')
    .valueOf()
};
const unsupportedCarryOverDoc = {
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'DELETED',
  timestamp: middleOfLastMonth
};
const startOfLastMonthCarryOverDoc = {
  collector_id: 3,
  event_guid: 'event-guid-3',
  state: 'STARTED',
  timestamp: startOfLastMonth
};
const middleOfLastMonthCarryOverDoc = {
  collector_id: 4,
  event_guid: 'event-guid-4',
  state: 'CREATED',
  timestamp: middleOfLastMonth
};
const endOfLastMonthCarryOverDoc = {
  collector_id: 5,
  event_guid: 'event-guid-5',
  state: 'STARTED',
  timestamp: endOfLastMonth
};

const startOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(startOfLastMonth)
  .withOrganizationId('org-id-1')
  .withCurrentInstances(2)
  .withPreviousInstances(1)
  .build();
const middleOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(middleOfLastMonth)
  .withOrganizationId('org-id-2')
  .withCurrentInstances(4)
  .withPreviousInstances(2)
  .build();
const endOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(endOfLastMonth)
  .withOrganizationId('org-id-3')
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

describe('renewer standard flow', () => {
  let externalSystemsMocks;

  before(
    yieldable.functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.abacusCollectorScopes)
        .return(fixture.abacusCollectorToken);

      externalSystemsMocks.abacusCollector.getUsageService.return.series([
        {
          statusCode: 200,
          body: startOfLastMonthAbacusUsage
        },
        {
          statusCode: 200,
          body: middleOfLastMonthAbacusUsage
        },
        {
          statusCode: 200,
          body: endOfLastMonthAbacusUsage
        }
      ]);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.ACCEPTED);

      externalSystemsMocks.startAll();

      yield carryOverDb.setup();
      yield carryOverDb.put(outOfSlackCarryOverDoc);
      yield carryOverDb.put(unsupportedCarryOverDoc);
      yield carryOverDb.put(startOfLastMonthCarryOverDoc);
      yield carryOverDb.put(middleOfLastMonthCarryOverDoc);
      yield carryOverDb.put(endOfLastMonthCarryOverDoc);
      fixture.renewer.start(externalSystemsMocks);

      yield waitUntil(serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(3));
    })
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('sends updated usage document to collector', () => {
    const abacusCollectorMock = externalSystemsMocks.abacusCollector;
    expect(abacusCollectorMock.collectUsageService.request(0).usage).to.deep.equal(
      fixture.usage
        .modify(startOfLastMonthAbacusUsage)
        .withTimestamp(startOfCurrentMonth)
        .withPreviousInstances(0)
        .build()
    );
    expect(abacusCollectorMock.collectUsageService.request(1).usage).to.deep.equal(
      fixture.usage
        .modify(middleOfLastMonthAbacusUsage)
        .withTimestamp(startOfCurrentMonth)
        .withPreviousInstances(0)
        .build()
    );
    expect(abacusCollectorMock.collectUsageService.request(2).usage).to.deep.equal(
      fixture.usage
        .modify(endOfLastMonthAbacusUsage)
        .withTimestamp(startOfCurrentMonth)
        .withPreviousInstances(0)
        .build()
    );
  });

  it('sends correct oauth token to collector', () => {
    const abacusCollectorMock = externalSystemsMocks.abacusCollector;
    const expectedToken = fixture.abacusCollectorToken;
    expect(abacusCollectorMock.collectUsageService.request(0).token).to.equal(expectedToken);
    expect(abacusCollectorMock.collectUsageService.request(1).token).to.equal(expectedToken);
    expect(abacusCollectorMock.collectUsageService.request(2).token).to.equal(expectedToken);
  });

  it(
    'records entries in carry-over',
    yieldable.functioncb(function*() {
      const abacusCollectorMock = externalSystemsMocks.abacusCollector;
      const docs = yield carryOverDb.readCurrentMonthDocs();
      const expectedNewDocuments = [
        {
          collector_id: abacusCollectorMock.resourceLocation,
          event_guid: startOfLastMonthCarryOverDoc.event_guid,
          state: startOfLastMonthCarryOverDoc.state,
          timestamp: startOfCurrentMonth
        },
        {
          collector_id: abacusCollectorMock.resourceLocation,
          event_guid: middleOfLastMonthCarryOverDoc.event_guid,
          state: middleOfLastMonthCarryOverDoc.state,
          timestamp: startOfCurrentMonth
        },
        {
          collector_id: abacusCollectorMock.resourceLocation,
          event_guid: endOfLastMonthCarryOverDoc.event_guid,
          state: endOfLastMonthCarryOverDoc.state,
          timestamp: startOfCurrentMonth
        }
      ];
      expect(docs).to.deep.equal(expectedNewDocuments);
    })
  );

  it(
    'exposes correct statistics',
    yieldable.functioncb(function*() {
      const response = yield fixture.renewer.readStats.withValidToken();
      expect(response.statusCode).to.equal(httpStatus.OK);
      const usageStats = response.body.statistics.usage;
      expect(usageStats.report).to.deep.equal({
        success: 3,
        skipped: {
          conflicts: 0,
          legal_reasons: 0
        },
        failures: 0
      });
      expect(omit(usageStats.get, 'missingToken')).to.deep.equal({
        success: 3,
        failures: 0
      });
    })
  );
});
