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

const endOfLastMonth = moment
  .utc(now)
  .subtract(1, 'month')
  .endOf('month')
  .valueOf();

const carryOverDocId = (timestamp, resourceInstanceId) => 
  `t/000${timestamp}/k/org-id-1/space-id/consumer-id/resource-id/plan-id/${resourceInstanceId}`;

const createServiceCarryOverDoc = {
  _id: carryOverDocId(startOfLastMonth, 'some-resource-instance'),
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'CREATED',
  timestamp: startOfLastMonth
};

const deleteServiceCarryOverDoc = {
  _id: carryOverDocId(startOfCurrentMonth, 'some-resource-instance'),
  collector_id: 3,
  event_guid: 'event-guid-3',
  state: 'DELETED',
  timestamp: startOfCurrentMonth
};


const renewableCarryOverDoc = {
  _id: carryOverDocId(endOfLastMonth, 'another-resource-instance'),
  collector_id: 2,
  event_guid: 'event-guid-2',
  state: 'CREATED',
  timestamp: endOfLastMonth
};

const endOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(endOfLastMonth)
  .withOrganizationId('org-id-2')
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

describe('bug test ....', () => {
  let externalSystemsMocks;

  before(functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.abacusCollectorScopes)
        .return(fixture.abacusCollectorToken);

      externalSystemsMocks.abacusCollector.getUsageService.return.firstTime({
        statusCode: 200,
        body: endOfLastMonthAbacusUsage
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.ACCEPTED);

      externalSystemsMocks.startAll();

      yield carryOverDb.setup();
      yield carryOverDb.put(createServiceCarryOverDoc);
      yield carryOverDb.put(renewableCarryOverDoc);
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

  it('create event with matching delete event is not renewed in current month', functioncb(function*() {
      const currentMonthDocs = yield carryOverDb.readCurrentMonthDocs();
      expect(currentMonthDocs).to.contains(omit(deleteServiceCarryOverDoc, '_id', '_rev'));
    })
  );
  

});
