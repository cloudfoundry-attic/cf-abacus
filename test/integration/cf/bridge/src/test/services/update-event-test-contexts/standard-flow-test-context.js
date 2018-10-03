'use strict';

const _ = require('underscore');
const httpStatus = require('http-status-codes');

const createWait = require('abacus-wait');
const yieldable = require('abacus-yieldable');

const { serviceMock } = require('abacus-mock-util');

const waitUntil = yieldable(createWait().until);

let arrange;

const run = (test) => {
  context('when reading UPDATE event from Cloud Controller', () => {
    const createEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('create-event-guid')
      .get();

    const updateEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('update-event-guid')
      .overwriteState(arrange.fixture.usageEventStates.updated)
      .overwriteServicePlanName(arrange.fixture.planNames.custom)
      .get();
    const getExpectedCarryOverEntries = () => {
      const carryOverEntries = [];
      carryOverEntries.push({
        guid: updateEvent.metadata.guid,
        state: arrange.fixture.usageEventStates.default,
        planName: arrange.fixture.planNames.custom
      });
      carryOverEntries.push({
        guid: updateEvent.metadata.guid,
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
            notsupported: 0,
            skips: 1
          }, failures: 0
        };
      };

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([updateEvent]);
      };

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(updateEvent.metadata.guid);
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
          .overwriteUsageTime(createEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(updateEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        return expectedUsageDocs;
      };

      const getExpectedStatistics = () => {
        return {
          success: {
            all: 2,
            conflicts: 0,
            notsupported: 0,
            skips: 0
          },
          failures: 0
        };
      };

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        _(expectedCallsToCollectUsageService).times(() => responses.push(httpStatus.ACCEPTED));

        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(createEvent.metadata.guid);
        expectedGuids.push(updateEvent.metadata.guid);
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
      const consecutiveUpdateEvent = arrange.fixture.usageEvent()
        .overwriteEventGuid('next-update-event-guid')
        .overwriteState(arrange.fixture.usageEventStates.updated)
        .overwriteServicePlanName(arrange.fixture.planNames.consecutive)
        .get();

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([consecutiveUpdateEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        _(expectedCallsToCollectUsageService).times(() => responses.push(httpStatus.ACCEPTED));
        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      const getExpectedUsageDocs = () => {
        const expectedUsageDocs = [];
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(createEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateEvent.metadata.created_at)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(updateEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        // Increase explicitelly created_at time due to carry over adjustment of usages with same timestamps
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(consecutiveUpdateEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        expectedUsageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(consecutiveUpdateEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.consecutive)
          .get());
        return expectedUsageDocs;
      };

      const getExpectedGuids = () => {
        const expectedGuids = [];
        expectedGuids.push(undefined);
        expectedGuids.push(createEvent.metadata.guid);
        expectedGuids.push(updateEvent.metadata.guid);
        expectedGuids.push(consecutiveUpdateEvent.metadata.guid);
        return expectedGuids;
      };

      const getExpectedCarryOverEntries = () => {
        const carryOverEntries = [];
        carryOverEntries.push({
          guid: consecutiveUpdateEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.default
        });
        carryOverEntries.push({
          guid: consecutiveUpdateEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.deleted
        });
        carryOverEntries.push({
          guid: updateEvent.metadata.guid,
          state: arrange.fixture.usageEventStates.deleted
        });
        return carryOverEntries;
      };

      const getExpectedStatistics = () => ({
        success: {
          all: 3,
          conflicts: 0,
          notsupported: 0,
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
