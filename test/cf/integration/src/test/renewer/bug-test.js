'use strict';

/* eslint-disable max-len */

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

const startOfCurrentMonth = moment
  .utc(now)
  .startOf('month')
  .valueOf();

const oneHourAfterStartOfCurrentMonth = moment
  .utc(now)
  .startOf('month')
  .add(1, 'hour')
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

const carryOverDocId = (timestamp) => 
  `t/000${timestamp}/k/org-id-1/space-id/consumer-id/resource-id/plan-id/resource-instance-id`;

const startOfLastMonthCarryOverDoc = {
  _id: carryOverDocId(startOfLastMonth),
  collector_id: 1,
  event_guid: 'event-guid-1',
  state: 'CREATED',
  timestamp: startOfLastMonth
};

const endOfLastMonthCarryOverDoc = {
  _id: carryOverDocId(endOfLastMonth),
  collector_id: 2,
  event_guid: 'event-guid-2',
  state: 'CREATED',
  timestamp: endOfLastMonth
};

const currentMonthDeleteCarryOverDoc = {
  _id: carryOverDocId(startOfCurrentMonth),
  collector_id: 3,
  event_guid: 'event-guid-3',
  state: 'DELETED',
  timestamp: oneHourAfterStartOfCurrentMonth
};


const startOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(startOfLastMonth)
  .withOrganizationId('org-id-1')
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

const endOfLastMonthAbacusUsage = fixture.usage
  .create()
  .withTimestamp(endOfLastMonth)
  .withOrganizationId('org-id-2')
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

describe('bug test ....', () => {
  let externalSystemsMocks;

  before(
    yieldable.functioncb(function*() {
      externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.abacusCollectorScopes)
        .return(fixture.abacusCollectorToken);

      externalSystemsMocks.abacusCollector.getUsageService.return.series([{
        statusCode: 200,
        body: startOfLastMonthAbacusUsage
      }, {
        statusCode: 200,
        body: endOfLastMonthAbacusUsage
      }]);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.ACCEPTED);

      externalSystemsMocks.startAll();
      

      yield carryOverDb.setup();
      
      yield carryOverDb.put(startOfLastMonthCarryOverDoc);
      yield carryOverDb.put(endOfLastMonthCarryOverDoc);
      yield carryOverDb.put(currentMonthDeleteCarryOverDoc);
      
      fixture.renewer.start(externalSystemsMocks);

      console.log('111111');
      // FIXME:
      yield waitUntil(serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(2));
      console.log('222222');
    })
  );

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('records entries in carry-over', yieldable.functioncb(function*() {
      const docs = yield carryOverDb.readCurrentMonthDocs();

      console.log(docs);
      const expectedNewDocuments = [{
          collector_id: 'http://location.com',
          event_guid: 'event-guid-1',
          state: 'CREATED',
          timestamp: startOfCurrentMonth
        }, omit(currentMonthDeleteCarryOverDoc, '_id', '_rev')
      ];
      expect(docs).to.deep.equal(expectedNewDocuments);
    })
  );
  

});
