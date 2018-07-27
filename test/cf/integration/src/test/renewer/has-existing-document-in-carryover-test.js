'use strict';

/* eslint-disable max-len */

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const moment = require('abacus-moment');
const {yieldable, functioncb} = require('abacus-yieldable');

const fixture = require('./fixture');

const carryOverDb = require('../utils/carry-over-db');
const serviceMock = require('../utils/service-mock-util');
const createWait = require('abacus-wait');

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

const orgId = 'org-id-1';
const carryOverDocId = (timestamp) => 
  `t/000${timestamp}/k/${orgId}/space-id/consumer-id/resource-id/plan-id/resource-instance-id`;

const createServiceCarryOverDoc = {
  _id: carryOverDocId(startOfLastMonth),
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'CREATED',
  timestamp: startOfLastMonth
};

const deleteServiceCarryOverDoc = {
  _id: carryOverDocId(startOfCurrentMonth),
  collector_id: 2,
  event_guid: 'event-guid-2',
  state: 'DELETED',
  timestamp: startOfCurrentMonth
};

const abacusUsageDoc = fixture.usage
  .create()
  .withTimestamp(startOfLastMonth)
  .withOrganizationId(orgId)
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

describe('An existing document in carry over for current month', () => {
  let externalSystemsMocks;

  before(functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.abacusCollectorScopes)
        .return(fixture.abacusCollectorToken);

      externalSystemsMocks.abacusCollector.getUsageService.return.firstTime({
        statusCode: 200,
        body: abacusUsageDoc
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.firstTime(httpStatus.ACCEPTED);

      externalSystemsMocks.startAll();

      yield carryOverDb.setup();
      yield carryOverDb.put(createServiceCarryOverDoc);
      yield carryOverDb.put(deleteServiceCarryOverDoc);
      
      fixture.renewer.start(externalSystemsMocks);

      yield waitUntil(serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(1));
    })
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('is not overwritten by renewer', functioncb(function*() {
    const currentMonthDocs = yield carryOverDb.readCurrentMonthDocs();
    expect(currentMonthDocs.length).to.equals(1);
    expect(currentMonthDocs).to.contains(omit(deleteServiceCarryOverDoc, '_id', '_rev'));
  }));
});
