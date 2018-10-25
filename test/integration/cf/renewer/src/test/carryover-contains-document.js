'use strict';

const httpStatus = require('http-status-codes');
const { omit } = require('underscore');

const moment = require('abacus-moment');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const fixture = require('./fixture');

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
const abacusUsageDoc = fixture.usage
  .create()
  .withTimestamp(startOfLastMonth)
  .withOrganizationId(orgId)
  .withCurrentInstances(1)
  .withPreviousInstances(0)
  .build();

const carryOverDocId = (timestamp) =>
  `t/000${timestamp}/k/${orgId}/${abacusUsageDoc.space_id}/${abacusUsageDoc.consumer_id}/`
    + `${abacusUsageDoc.resource_id}/${abacusUsageDoc.plan_id}/${abacusUsageDoc.resource_instance_id}`;

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

describe('when carryover contains a document for current month and renewer starts', () => {

  let externalSystemsMocks;

  before(async () => {
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

    await carryOverDb.setup();
    await carryOverDb.put(createServiceCarryOverDoc);
    await carryOverDb.put(deleteServiceCarryOverDoc);

    fixture.renewer.start(externalSystemsMocks);

    await eventually(serviceMock(externalSystemsMocks.abacusCollector.collectUsageService).received(1));
  });

  after((done) => {
    fixture.renewer.stop();
    carryOverDb.teardown();
    externalSystemsMocks.stopAll(done);
  });

  it('the document is not overwritten', async () => {
    const currentMonthDocs = await carryOverDb.readCurrentMonthDocs();
    expect(currentMonthDocs.length).to.equals(1);
    expect(currentMonthDocs[0]).to.deep.equal(omit(deleteServiceCarryOverDoc, '_id', '_rev'));
  });
});
