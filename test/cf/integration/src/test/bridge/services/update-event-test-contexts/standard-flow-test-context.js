'use strict';

const _ = require('underscore');
const httpStatus = require('http-status-codes');

const createWait = require('abacus-wait');
const yieldable = require('abacus-yieldable');
const waitUntil = yieldable(createWait().until);

const serviceMock = require('../../../utils/service-mock-util');

let arrange;

const run = (test) => {
  context('when reading UPDATE event from Cloud Controller', () => {
    const createUsageEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('create-event-guid')
      .get();
  
    const updateUsageEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('update-event-guid')
      .overwriteState(arrange.fixture.usageEventStates.updated)
      .overwriteServicePlanName(arrange.fixture.planNames.custom)
      .get();
    const getExpectedCarryOverEntries = () => {
      const carryOverEntries = [];
      carryOverEntries.push({
        guid: updateUsageEvent.metadata.guid,
        state: arrange.fixture.usageEventStates.default,
        planName: arrange.fixture.planNames.custom
      });
      carryOverEntries.push({
        guid: updateUsageEvent.metadata.guid,
        state: arrange.fixture.usageEventStates.deleted,
        planName: arrange.fixture.planNames.default
      });  
      return carryOverEntries;
    };
    context('when preceding event is not found', () => {
      const expectedNumBerOfCarryOverEntries = 0;
      const expectedCallsToCollectUsageService = 0;
      
      const getExpectedStatistics = () => {
        return {
          success: {
            all: 1,
            conflicts: 0,
            skips: 1
          }, failures: 0
        };
      };

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([updateUsageEvent]);
      };

      before(yieldable.functioncb(function*() {
        arrange.init();
        setCloudControllerResponse(); 
        yield arrange.finalizeSetup();
        yield waitUntil(
          serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents).received(1 + 1));
      }));
  
      after((done) => {
        arrange.cleanUp(done);
      });

      test.collectUsageService(expectedCallsToCollectUsageService);
      test.carryOver(expectedNumBerOfCarryOverEntries, []);
      test.statistics(getExpectedStatistics());
    });

    context('when preceding event is found', () => {  
      const expectedNumBerOfCarryOverEntries = 2;
      const expectedCallsToCollectUsageService = 3;

      const getExpectedUsageDocs = () => {
        const expectedUsageDocs = [];
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(createUsageEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateUsageEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(updateUsageEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        return expectedUsageDocs;
      };

      const getExpectedStatistics = () => {
        return {
          success: {
            all: 2,
            conflicts: 0,
            skips: 0
          }, 
          failures: 0
        };
      };

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        _(expectedCallsToCollectUsageService).times(() => responses.push(httpStatus.CREATED));

        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      before(yieldable.functioncb(function*() {
        arrange.init();
        setCloudControllerResponse();
        setAbacusCollectorResponse();
        yield arrange.finalizeSetup();
        yield waitUntil(serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents).received(4));
      }));
  
      after((done) => {
        arrange.cleanUp(done);
      });

      test.collectUsageService(expectedCallsToCollectUsageService, getExpectedUsageDocs());
      test.statistics(getExpectedStatistics());
      test.carryOver(expectedNumBerOfCarryOverEntries, getExpectedCarryOverEntries());
    });
  });
};

const testContext = {
  arrange: (testArrange) => {
    arrange = testArrange;
    return testContext;
  },
  run
};

module.exports = testContext;
