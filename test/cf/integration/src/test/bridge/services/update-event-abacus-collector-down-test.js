'use strict';

const httpStatus = require('http-status-codes');
const _ = require('underscore');

const serviceMock = require('../../utils/service-mock-util');

const { yieldable, functioncb } = require('abacus-yieldable');
const carryOverDb = require('../../utils/carry-over-db');
const createWait = require('abacus-wait');
const waitUntil = yieldable(createWait().until);
const servicesFixture = require('./fixture');

describe('services-bridge update event tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  context('when abacus collector is down', () => {
    let externalSystemsMocks;
    let createUsageEventMetadata;
    let updateUsageEventMetadata;

    before(
      yieldable.functioncb(function*() {
        externalSystemsMocks = servicesFixture.externalSystemsMocks();
        externalSystemsMocks.startAll();
        

        externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(servicesFixture.oauth.abacusCollectorScopes)
        .return(servicesFixture.oauth.abacusCollectorToken);
        
        externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(servicesFixture.oauth.cfAdminScopes)
        .return(servicesFixture.oauth.cfAdminToken);
        
        const createServiceUsageEvent = servicesFixture
        .usageEvent()
        .overwriteEventGuid('create-event-guid')
        .get();
        createUsageEventMetadata = createServiceUsageEvent.metadata;
        
        const updateServiceUsageEvent = servicesFixture
        .usageEvent()
        .overwriteEventGuid('update-event-guid')
        .overwriteState(servicesFixture.usageEventStates.updated)
        .get();
        updateUsageEventMetadata = updateServiceUsageEvent.metadata;
        
        let eventSeries = [];
        eventSeries.push([createServiceUsageEvent]);
        eventSeries.push([updateServiceUsageEvent]);
        eventSeries.push([updateServiceUsageEvent]);
        externalSystemsMocks.cloudController.usageEvents.return.series(eventSeries);
        
        // Event reporter (abacus-client) will retry 'fixture.env.retryCount'
        // times to report usage to abacus. After that the whole process is
        // retried (i.e. start reading again the events).  Stub Abacus Collector
        // so that it will force the bridge to retry the whole proces.
        const failRequetsCount = servicesFixture.env.retryCount + 1;
        const responses = _(failRequetsCount).times(() => httpStatus.BAD_GATEWAY);
        responses.unshift(httpStatus.CREATED);
        // Update event results in two events (DELETED and CREATED), which will be reported to abacus
        responses.push(httpStatus.CREATED);
        responses.push(httpStatus.CREATED);
        externalSystemsMocks.abacusCollector.collectUsageService.return.series(responses);

        yield carryOverDb.setup();
        servicesFixture.bridge.start(externalSystemsMocks);

        yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(4));
      })
    );

    after((done) => {
      servicesFixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    it('Service Usage Events receive correct requests ', () => {
      const verifyServiceUsageEventsAfterGuid = (requestNumber, afterGuid) => {
        expect(externalSystemsMocks.cloudController.usageEvents.request(requestNumber).afterGuid).to.equal(afterGuid);
      };

      verifyServiceUsageEventsAfterGuid(0, undefined);
      verifyServiceUsageEventsAfterGuid(1, createUsageEventMetadata.guid);
      verifyServiceUsageEventsAfterGuid(2, createUsageEventMetadata.guid);
      verifyServiceUsageEventsAfterGuid(3, updateUsageEventMetadata.guid);
    });

  });
});
