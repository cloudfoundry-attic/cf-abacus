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
      const expectedCallsToUsageEventsService = 2;
      
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

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(updateUsageEvent.metadata.guid);
        return expectedGuids;
      };

      before(yieldable.functioncb(function*() {
        arrange.init();
        setCloudControllerResponse(); 
        yield arrange.finalizeSetup();
        yield waitUntil(
          serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents)
            .received(expectedCallsToUsageEventsService));
      }));
  
      after((done) => {
        arrange.cleanUp(done);
      });

      test.usageEventsService(expectedCallsToUsageEventsService, getExpectedGuids());
      test.collectUsageService(expectedCallsToCollectUsageService);
      test.carryOver(expectedNumBerOfCarryOverEntries, []);
      test.statistics(getExpectedStatistics());
    });

    context('when preceding event is found', () => {  
      const expectedNumBerOfCarryOverEntries = 2;
      const expectedCallsToCollectUsageService = 3;
      const expectedCallsToUsageEventsService = 3;

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

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(createUsageEvent.metadata.guid);
        expectedGuids.push(updateUsageEvent.metadata.guid);
        return expectedGuids;
      };

      before(yieldable.functioncb(function*() {
        arrange.init();
        setCloudControllerResponse();
        setAbacusCollectorResponse();
        yield arrange.finalizeSetup();
        yield waitUntil(serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService));
      }));
  
      after((done) => {
        arrange.cleanUp(done);
      });
      
      test.usageEventsService(expectedCallsToUsageEventsService, getExpectedGuids());
      test.collectUsageService(expectedCallsToCollectUsageService, getExpectedUsageDocs());
      test.statistics(getExpectedStatistics());
      test.carryOver(expectedNumBerOfCarryOverEntries, getExpectedCarryOverEntries());
    });

    context('when service is consecutively updated', () => {
      const expectedNumBerOfCarryOverEntries = 3;
      const expectedCallsToUsageEventsService = 4;
      const expectedCallsToCollectUsageService = 5;
      const nextUpdateUsageEvent = arrange.fixture.usageEvent()
        .overwriteEventGuid('next-update-event-guid')
        .overwriteState(arrange.fixture.usageEventStates.updated)
        .overwriteServicePlanName(arrange.fixture.planNames.standard)
        .get();

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([nextUpdateUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        _(expectedCallsToCollectUsageService).times(() => responses.push(httpStatus.CREATED));

        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

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
        // Increase explicitelly created_t time due to carry over adjustment of usages with same timestamps
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(nextUpdateUsageEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(nextUpdateUsageEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.standard)
          .get());
        return expectedUsageDocs;
      };

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(createUsageEvent.metadata.guid);
        expectedGuids.push(updateUsageEvent.metadata.guid);
        expectedGuids.push(nextUpdateUsageEvent.metadata.guid);
        return expectedGuids;
      };

      const getExpectedCarryOverEntries = () => {
        const carryOverEntries = [];
        carryOverEntries.push({
          guid: nextUpdateUsageEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.deleted
        });
        carryOverEntries.push({
          guid: updateUsageEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.deleted
        });
        carryOverEntries.push({
          guid: nextUpdateUsageEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.default
        });
        return carryOverEntries;
      };

      const getExpectedStatistics = () => ({
        success: {
          all: 3,
          conflicts: 0,
          skips: 0
        }, 
        failures: 0
      });
    
      before(yieldable.functioncb(function*() {
        arrange.init();
        setCloudControllerResponse();
        setAbacusCollectorResponse();
        yield arrange.finalizeSetup();
        yield waitUntil(serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService)
        );
      }));

      after((done) => {
        arrange.cleanUp(done);
      });

      test.collectUsageService(expectedCallsToCollectUsageService, getExpectedUsageDocs());
      test.usageEventsService(expectedCallsToUsageEventsService, getExpectedGuids());
      test.carryOver(expectedNumBerOfCarryOverEntries, getExpectedCarryOverEntries());
      test.statistics(getExpectedStatistics());
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
