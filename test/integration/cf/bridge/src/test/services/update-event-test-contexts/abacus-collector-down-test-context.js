'use strict';

const _ = require('underscore');
const httpStatus = require('http-status-codes');

const { serviceMock } = require('abacus-mock-util');

let arrange;

const run = (test) => {
  context('when abacus collector is down', () => {
    const expectedCallsToUsageEventsService = 4;
    const createServiceUsageEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('create-event-guid')
      .get();

    const updateServiceUsageEvent = arrange.fixture.usageEvent()
      .overwriteEventGuid('update-event-guid')
      .overwriteState(arrange.fixture.usageEventStates.updated)
      .overwriteServicePlanName(arrange.fixture.planNames.custom)
      .get();

    // Event reporter (abacus-client) will retry 'fixture.env.retryCount'
    // times to report usage to abacus. After that the whole process is
    // retried (i.e. start reading again the events).  Stub Abacus Collector
    // so that it will force the bridge to retry the whole proces.
    const failRequestsCount = arrange.fixture.env.retryCount + 1;

    const getExpectedCarryOverEntries = () => [
      {
        guid: updateServiceUsageEvent.metadata.guid,
        state: arrange.fixture.usageEventStates.default,
        planName: arrange.fixture.planNames.custom
      },
      {
        guid: updateServiceUsageEvent.metadata.guid,
        state: arrange.fixture.usageEventStates.deleted,
        planName: arrange.fixture.planNames.default
      }
    ];

    context('in the beggining of UPDATE event', () => {
      const expectedNumBerOfCarryOverEntries = 2;
      const expectedCallsToCollectUsageService = 7;

      const getExpectedUsageDocs = () => {
        const usageDocs = [];
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(createServiceUsageEvent.metadata.created_at)
          .overwritePlanName(arrange.fixture.planNames.default)
          .get());
        _(failRequestsCount).times(() =>
          usageDocs.push(arrange.fixture.collectorUsage()
            .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
            .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
            .get()));
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .get());
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        return usageDocs;
      };

      const getExpectedGuids = () => [
        undefined,
        createServiceUsageEvent.metadata.guid,
        createServiceUsageEvent.metadata.guid,
        updateServiceUsageEvent.metadata.guid
      ];

      const getExpectedStatistics = () => ({
        success: {
          all: 2,
          conflicts: 0,
          notsupported: 0,
          skips: 0
        },
        failures: 1
      });

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createServiceUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateServiceUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([updateServiceUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        responses.push(httpStatus.ACCEPTED);
        _(failRequestsCount).times(() => responses.push(httpStatus.BAD_GATEWAY));
        responses.push(httpStatus.ACCEPTED);
        responses.push(httpStatus.ACCEPTED);

        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      before(async () => {
        arrange.init();
        setCloudControllerResponse();
        setAbacusCollectorResponse();
        await arrange.finalizeSetup();
        await eventually(serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService));
        await eventually(serviceMock(arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService)
          .received(expectedCallsToCollectUsageService));
      });

      after((done) => {
        arrange.cleanUp(done);
      });

      test.collectUsageService(expectedCallsToCollectUsageService, getExpectedUsageDocs());
      test.usageEventsService(expectedCallsToUsageEventsService, getExpectedGuids());
      test.carryOver(expectedNumBerOfCarryOverEntries, getExpectedCarryOverEntries());
      test.statistics(getExpectedStatistics());
    });

    context('in the middle of UPDATE event', () => {
      const expectedNumBerOfCarryOverEntries = 2;
      const expectedCallsToCollectUsageService = 8;

      const getExpectedUsageDocs = () => {
        const usageDocs = [];
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteUsageTime(createServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .get());
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .get());
        _(failRequestsCount).times(() =>
          usageDocs.push(arrange.fixture.collectorUsage()
            .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
            .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
            .overwritePlanName(arrange.fixture.planNames.custom)
            .get()));
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at)
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.deleted)
          .get());
        usageDocs.push(arrange.fixture.collectorUsage()
          .overwriteUsageTime(updateServiceUsageEvent.metadata.created_at + 1)
          .overwriteMeasuredUsage(arrange.fixture.usageEventStates.default)
          .overwritePlanName(arrange.fixture.planNames.custom)
          .get());
        return usageDocs;
      };

      const getExpectedGuids = () => {
        const guids = [];
        guids.push(undefined);
        guids.push(createServiceUsageEvent.metadata.guid);
        guids.push(createServiceUsageEvent.metadata.guid);
        guids.push(updateServiceUsageEvent.metadata.guid);
        return guids;
      };

      const getExpectedStatistics = () => {
        return {
          success: {
            all: 2,
            conflicts: 1,
            notsupported: 0,
            skips: 0
          },
          failures: 1
        };
      };

      const setCloudControllerResponse = () => {
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.firstTime([createServiceUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.secondTime([updateServiceUsageEvent]);
        arrange.fixture.externalSystemsMocks().cloudController.usageEvents.return.thirdTime([updateServiceUsageEvent]);
      };

      const setAbacusCollectorResponse = () => {
        const responses = [];
        responses.push(httpStatus.ACCEPTED);
        responses.push(httpStatus.ACCEPTED);
        _(failRequestsCount).times(() => responses.push(httpStatus.BAD_GATEWAY));
        responses.push(httpStatus.CONFLICT);
        responses.push(httpStatus.ACCEPTED);

        arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.series(responses);
      };

      before(async () => {
        arrange.init();
        setCloudControllerResponse();
        setAbacusCollectorResponse();
        await arrange.finalizeSetup();
        await eventually(serviceMock(arrange.fixture.externalSystemsMocks().cloudController.usageEvents)
          .received(expectedCallsToUsageEventsService));
        await eventually(serviceMock(arrange.fixture.externalSystemsMocks().abacusCollector.collectUsageService)
          .received(expectedCallsToCollectUsageService));
      });

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
