'use strict';

const httpStatus = require('http-status-codes');
const _ = require('underscore');
const omit = _.omit;

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');
const createWait = require('abacus-wait');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const fixture = require('./fixture');

const waitUntil = yieldable(createWait().until);

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

describe('renewer sends usage, but abacus is down', () => {
  let externalSystemsMocks;

  before(yieldable.functioncb(function*() {
    externalSystemsMocks = fixture.externalSystemsMocks();

    externalSystemsMocks.uaaServer.tokenService
      .whenScopesAre(fixture.abacusCollectorScopes)
      .return(fixture.abacusCollectorToken);

    externalSystemsMocks.abacusCollector.getUsageService.return.always({
      statusCode: 200,
      body: fixture.usage
        .create()
        .withTimestamp(endOfLasMonth)
        .withCurrentInstances(2)
        .withPreviousInstances(1)
        .build()
    });

    externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.BAD_GATEWAY);

    externalSystemsMocks.startAll();

    yield carryOverDb.setup();
    yield carryOverDb.put(carryOverDoc);
    fixture.renewer.start(externalSystemsMocks);

    // Event reporter (abacus-client) will retry 'fixture.env.retryCount' + 1
    // times to report usage to abacus. After that it will give up.
    yield waitUntil(
      serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(
        fixture.renewer.env.retryCount + 1
      )
    );
  })
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it(
    'does not record an entry in carry-over',
    yieldable.functioncb(function*() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    })
  );

  it(
    'exposes correct statistics',
    yieldable.functioncb(function*() {
      const response = yield fixture.renewer.readStats.withValidToken();
      expect(response.statusCode).to.equal(httpStatus.OK);
      const usageStats = response.body.statistics.usage;
      expect(usageStats.report).to.deep.equal({
        success: 0,
        skipped: {
          conflicts: 0,
          legal_reasons: 0
        },
        failures: 1
      });
      expect(omit(usageStats.get, 'missingToken')).to.deep.equal({
        success: 1,
        failures: 0
      });
    })
  );
});
