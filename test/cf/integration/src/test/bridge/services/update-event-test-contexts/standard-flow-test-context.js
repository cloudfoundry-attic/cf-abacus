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
  context('when reading UPDATE event from Cloud Controller', () => {

    const createUsageEvent = fixture.usageEvent()
      .overwriteEventGuid('create-event-guid')
      .get();
  
    const updateUsageEvent = fixture.usageEvent()
      .overwriteEventGuid('update-event-guid')
      .overwriteState(fixture.usageEventStates.updated)
      .overwriteServicePlanName(fixture.planNames.custom)
      .get();

    context('without previous CREATED event', () => {
      const expectedStatistics = { success: {}, failures: {} };

      const expectedCallsToCollectUsageService = 0;
      
      const setExpectedStatistics = () => {
        expectedStatistics.success = {
          all: 1,
          conflicts: 0,
          skips: 1
        }; 
        expectedStatistics.failures = 0;
      };

      const setCloudControllerResponse = () => {
        fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([updateUsageEvent]);
      };

      const customSetup = (fixture) => {
        setExpectedStatistics();

        setCloudControllerResponse();
      };
  
      const waitLogic = function*(fixture) {
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().cloudController.usageEvents).received(1 + 1));
      };

      before(yieldable.functioncb(function*() {
        setup.prepareCommonSetup(fixture);
        setup.prepareCustomSetup(customSetup, fixture);
        yield setup.finalizeTestSetup(waitLogic, fixture);  
      }));
  
      after((done) => {
        cleanUp(fixture, done);
      });

      test.collectUsageService(fixture, expectedCallsToCollectUsageService);
      test.statistics(fixture, expectedStatistics);
    });

    context('with previous CREATED event', () => {  
      const expectedUsageDocs = [];
      const expectedStatistics = { success: {}, failures: {} };

      const expectedCallsToCollectUsageService = 3;

      const setExpectedUsageDocs = () => {
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .overwriteUsageTime(createUsageEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateUsageEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(fixture.collectorUsage()
          .overwriteMeasuredUsage(fixture.usageEventStates.default)
          .overwriteUsageTime(updateUsageEvent.metadata.created_at + 1)
          .overwritePlanName(fixture.planNames.custom)
          .get());
      };

      const setExpectedStatistics = () => {
        expectedStatistics.success = {
          all: 2,
          conflicts: 0,
          skips: 0
        }; 
        expectedStatistics.failures = 0;
      };

      const setCloudControllerResponse = () => {
        fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createUsageEvent]);
        fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        _(expectedCallsToCollectUsageService).times(() => responses.push(httpStatus.CREATED));

        fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      const customSetup = (fixture) => {  
        setExpectedUsageDocs();
        setExpectedStatistics();

        setCloudControllerResponse();
        setAbacusCollectorResponse();
      };
  
      const waitLogic = function*(fixture) {
        yield waitUntil(serviceMock(fixture.externalSystemsMocks().cloudController.usageEvents).received(4));
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
