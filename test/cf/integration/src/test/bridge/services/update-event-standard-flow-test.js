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

  context('when reading UPDATE event from Cloud Controller', () => {
    const createEventGuid = 'event-guid-1';
    const updateEventGuid = 'event-guid-2';
    const expectedCallsToCollectUsageService = 3;
    
    let externalSystemsMocks;
    let createUsageEventTimestamp;
    let deleteUsageEventTimestamp;

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

        const createUsageEvent = servicesFixture
          .usageEvent()
          .overwriteEventGuid(createEventGuid)
          .get();

        const updateUsageEvent = servicesFixture
          .usageEvent()
          .overwriteEventGuid(updateEventGuid)
          .overwriteState(servicesFixture.usageEventStates.updated)
          .get();

        externalSystemsMocks.cloudController.usageEvents.return.firstTime([createUsageEvent]);
        externalSystemsMocks.cloudController.usageEvents.return.secondTime([updateUsageEvent]);
        
        const responses = _(expectedCallsToCollectUsageService).times(() => httpStatus.CREATED);
        externalSystemsMocks.abacusCollector.collectUsageService.return.series(responses);

        createUsageEventTimestamp = createUsageEvent.metadata.created_at;
        deleteUsageEventTimestamp = updateUsageEvent.metadata.created_at;

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

    it('Collect Usage Service is called with correct arguments', () => {
      expect(servicesFixture.externalSystemsMocks().abacusCollector.collectUsageService.requests().length)
        .to.equal(expectedCallsToCollectUsageService);

      expect(servicesFixture.externalSystemsMocks().abacusCollector.collectUsageService.request(0)).to.deep.equal({
        token: servicesFixture.oauth.abacusCollectorToken,
        usage: servicesFixture.collectorUsage(createUsageEventTimestamp, servicesFixture.usageEventStates.default)
      });

      expect(servicesFixture.externalSystemsMocks().abacusCollector.collectUsageService.request(1)).to.deep.equal({
        token: servicesFixture.oauth.abacusCollectorToken,
        usage: servicesFixture.collectorUsage(deleteUsageEventTimestamp, servicesFixture.usageEventStates.deleted)
      });

      expect(servicesFixture.externalSystemsMocks().abacusCollector.collectUsageService.request(2)).to.deep.equal({
        token: servicesFixture.oauth.abacusCollectorToken,
        usage: servicesFixture.collectorUsage(deleteUsageEventTimestamp, servicesFixture.usageEventStates.default)
      });
    });
  });
});
