'use strict';

const _ = require('underscore');
const httpStatus = require('http-status-codes');

const createWait = require('abacus-wait');
const yieldable = require('abacus-yieldable');
const waitUntil = yieldable(createWait().until);

const serviceMock = require('../../../utils/service-mock-util');

let test;
let setup;
let cleanUp;
let fixture;

const run = () => {
  context('when abacus collector is down', () => {
    const expectedCallsToUsageEventsService = 4;
    const createServiceUsageEvent = fixture.usageEvent()
      .overwriteEventGuid('create-event-guid')
      .get();
        
    const updateServiceUsageEvent = fixture.usageEvent()
      .overwriteEventGuid('update-event-guid')
      .overwriteState(fixture.usageEventStates.updated)
      .overwriteServicePlanName(fixture.planNames.custom)
      .get();

    // Event reporter (abacus-client) will retry 'fixture.env.retryCount'
    // times to report usage to abacus. After that the whole process is
    // retried (i.e. start reading again the events).  Stub Abacus Collector
    // so that it will force the bridge to retry the whole proces.
    const failRequestsCount = fixture.env.retryCount + 1;

    context('in the beggining of UPDATE event', () => { 
      const expectedGuids = []; 
      const expectedUsageDocs = [];
      const expectedStatistics = { success: {}, failures: {} };
      
      const expectedCallsToCollectUsageService = 7;
      
      const setExpectedUsageDocs = () => {
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .overwriteUsageTime(createServiceUsageEvent.metadata.created_at)
          .overwritePlanName(fixture.planNames.default)
          .get());
        _(failRequestsCount).times(() => expectedUsageDocs.push(
          fixture.collectorUsage()
            .overwriteMeasuredUsage(fixture.usageEventStates.deleted)
            .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
            .get()));
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
          .overwritePlanName(fixture.planNames.custom)
          .get());
      };

      const setExpectedGuids = () => {
        expectedGuids.push(undefined);
        expectedGuids.push(createServiceUsageEvent.metadata.guid);
        expectedGuids.push(createServiceUsageEvent.metadata.guid);
        expectedGuids.push(updateServiceUsageEvent.metadata.guid);
      };

      const setExpectedStatistics = () => {
        expectedStatistics.success = {
          all: 2,
          conflicts: 0,
          skips: 0
        };
        expectedStatistics.failures = 1;
      };

      const setCloudControllerResponse = () => {
        fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createServiceUsageEvent]);
        fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateServiceUsageEvent]);
        fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([updateServiceUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        responses.push(httpStatus.CREATED);
        _(failRequestsCount).times(() => responses.push(httpStatus.BAD_GATEWAY));
        responses.push(httpStatus.CREATED); 
        responses.push(httpStatus.CREATED); 

        fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      const customSetup = (fixture) => {
        setExpectedGuids();
        setExpectedUsageDocs();
        setExpectedStatistics()

        setCloudControllerResponse();
        setAbacusCollectorResponse();
      };
  
      const waitLogic = function*(fixture) {
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService));
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().abacusCollector.collectUsageService)
          .received(expectedCallsToCollectUsageService));
      };
  
      before(yieldable.functioncb(function*() {   
        setup.prepareCommonSetup(fixture);
        setup.prepareCustomSetup(customSetup, fixture);
        yield setup.finalizeTestSetup(waitLogic, fixture);
      }));
  
      after((done) => {
        cleanUp(fixture, done);
      });

      test.collectUsageService(fixture, expectedCallsToCollectUsageService, expectedUsageDocs);
      test.usageEventsService(fixture, expectedCallsToUsageEventsService, expectedGuids);
      test.statistics(fixture, expectedStatistics);
    });

    context('in the middle of UPDATE event', () => { 
      const expectedGuids = []; 
      const expectedUsageDocs = [];
      const expectedStatistics = { success: {}, failures: {} };
      
      const expectedCallsToCollectUsageService = 8;

      const setExpectedUsageDocs = () => {
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteUsageTime(createServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .get());
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(fixture.usageEventStates.deleted)
          .get());
        _(failRequestsCount).times(() => expectedUsageDocs.push(
          fixture.collectorUsage()
            .overwriteMeasuredUsage(fixture.usageEventStates.default)
            .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
            .overwritePlanName(fixture.planNames.custom)
            .get()));
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(fixture.usageEventStates.deleted)
          .get()); 
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .overwritePlanName(fixture.planNames.custom)
          .get());
      };

      const setExpectedGuids = () => {
        expectedGuids.push(undefined);
        expectedGuids.push(createServiceUsageEvent.metadata.guid);
        expectedGuids.push(createServiceUsageEvent.metadata.guid);
        expectedGuids.push(updateServiceUsageEvent.metadata.guid);
      };

      const setExpectedStatistics = () => {
        expectedStatistics.success = {
          all: 2,
          conflicts: 0,
          skips: 0
        };
        expectedStatistics.failures = 1;
      };

      const setCloudControllerResponse = () => {
        fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createServiceUsageEvent]);
        fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateServiceUsageEvent]);
        fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([updateServiceUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        responses.push(httpStatus.CREATED);
        responses.push(httpStatus.CREATED);
        _(failRequestsCount).times(() => responses.push(httpStatus.BAD_GATEWAY));
        responses.push(httpStatus.CREATED);
        responses.push(httpStatus.CREATED);

        fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };
      
      const customSetup = (fixture) => {
        setExpectedGuids();
        setExpectedUsageDocs();
        setExpectedStatistics()

        setCloudControllerResponse();
        setAbacusCollectorResponse();
      };
  
      const waitLogic = function*(fixture) {
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService));
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().abacusCollector.collectUsageService)
          .received(expectedCallsToCollectUsageService));
      };
  
      before(yieldable.functioncb(function*() {   
        setup.prepareCommonSetup(fixture);
        setup.prepareCustomSetup(customSetup, fixture);
        yield setup.finalizeTestSetup(waitLogic, fixture);
      }));
  
      after((done) => {
        cleanUp(fixture, done);
      });

      test.collectUsageService(fixture, expectedCallsToCollectUsageService, expectedUsageDocs);
      test.usageEventsService(fixture, expectedCallsToUsageEventsService, expectedGuids);
      test.statistics(fixture, expectedStatistics);
    });
  });
};

const testContext = {
  fixture: (value) => {
    fixture = value;
    return testContext;
  },
  setup: (setupFn) => {
    setup = setupFn;
    return testContext;
  },
  commonTests: (tests) => {
    test = tests;
    return testContext;
  },
  cleanUp: (cleanUpFn) => {
    cleanUp = cleanUpFn;
    return testContext;
  },
  run
};

module.exports = testContext;
