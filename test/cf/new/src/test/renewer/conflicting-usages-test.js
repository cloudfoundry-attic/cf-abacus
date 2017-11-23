'use strict';

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const fixture = require('./utils/fixture');

const carryOverDb = require('../utils/carry-over-db');
const serviceMock = require('../utils/service-mock-util');
const wait = require('../utils/wait');

const waitUntil = yieldable(wait.until);

const now = moment.now();
const endOfLastMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();

const carryOverDoc = {
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'STARTED',
  timestamp: endOfLastMonth
};

describe('renewer sends conflicting documents', () => {
  let externalSystemsMocks;

  before(yieldable.functioncb(function *() {
    externalSystemsMocks = fixture.externalSystemsMocks();

    externalSystemsMocks
      .uaaServer
      .tokenService
      .whenScopes(fixture.abacusCollectorScopes)
      .return(fixture.abacusCollectorToken);

    externalSystemsMocks
      .abacusCollector
      .getUsageService
      .return
      .always({
        statusCode: 200,
        body: fixture.usage.create()
          .withTimestamp(endOfLastMonth)
          .withCurrentInstances(2)
          .withPreviousInstances(1)
          .build()
      });

    externalSystemsMocks
      .abacusCollector
      .collectUsageService
      .return
      .always(httpStatus.CONFLICT);

    externalSystemsMocks.startAll();

    yield carryOverDb.setup();
    yield carryOverDb.put(carryOverDoc);
    fixture.renewer.start(externalSystemsMocks);

    yield waitUntil(serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(1));
  }));

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
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
