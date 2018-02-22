'use strict';

const httpStatus = require('http-status-codes');
const serviceMock = require('../../utils/service-mock-util');

const { yieldable, functioncb } = require('abacus-yieldable');
const carryOverDb = require('../../utils/carry-over-db');
const createWait = require('abacus-wait');
const waitUntil = yieldable(createWait().until);

let fixture;

const build = () => {

  context('happy tests', () => {
    const createEventGuid = 'event-guid-1';
    const updateEventGuid = 'event-guid-2';
    
    let externalSystemsMocks;
    let createUsageEventTimestamp;
    let deleteUsageEventTimestamp;

    before(
      yieldable.functioncb(function*() {
        externalSystemsMocks = fixture.externalSystemsMocks();
        externalSystemsMocks.startAll();

        externalSystemsMocks.uaaServer.tokenService
          .whenScopesAre(fixture.oauth.abacusCollectorScopes)
          .return(fixture.oauth.abacusCollectorToken);

        externalSystemsMocks.uaaServer.tokenService
          .whenScopesAre(fixture.oauth.cfAdminScopes)
          .return(fixture.oauth.cfAdminToken);

        const createUsageEvent = fixture
          .usageEvent()
          .overwriteEventGuid(createEventGuid)
          .get();

        const updateUsageEvent = fixture
          .usageEvent()
          .overwriteEventGuid(updateEventGuid)
          .overwriteState(fixture.usageEventStates.updated)
          .get();

        externalSystemsMocks.cloudController.usageEvents.return.firstTime([createUsageEvent]);
        externalSystemsMocks.cloudController.usageEvents.return.secondTime([updateUsageEvent]);
        
        externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

        createUsageEventTimestamp = createUsageEvent.metadata.created_at;
        deleteUsageEventTimestamp = updateUsageEvent.metadata.created_at;

        yield carryOverDb.setup();
        fixture.bridge.start(externalSystemsMocks);

        yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(4));
      })
    );

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    it('Collect Usage Service is called with correct arguments', () => {
      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.requests().length).to.equal(3);

      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.request(0)).to.deep.equal({
        token: fixture.oauth.abacusCollectorToken,
        usage: fixture.collectorUsage(createUsageEventTimestamp, fixture.usageEventStates.default)
      });

      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.request(1)).to.deep.equal({
        token: fixture.oauth.abacusCollectorToken,
        usage: fixture.collectorUsage(deleteUsageEventTimestamp, fixture.usageEventStates.deleted)
      });

      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.request(2)).to.deep.equal({
        token: fixture.oauth.abacusCollectorToken,
        usage: fixture.collectorUsage(deleteUsageEventTimestamp, fixture.usageEventStates.default)
      });
    });
  });

  context('abacus collector is down', () => {

  });
};

const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  build
};

module.exports = testDef;
