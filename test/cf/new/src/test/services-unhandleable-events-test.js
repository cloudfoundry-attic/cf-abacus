'use strict';

const moment = require('abacus-moment');

const unhandleableEventsTestsDefinition = require('./test-definitions/unhandled-events-test-def');
const createServicesFixture = require('./lib/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
  });
};

const unhandleableEvents = (fixture) => {
  const unsupportedOrganzationUsageEvent = fixture
    .usageEvent()
    .overwriteOrgGuid('unsupported')
    .get();
  const unsupportedStateUsageEvent = fixture
    .usageEvent()
    .overwriteState('UPDATE')
    .get();
  const unsupportedServiceUsageEvent = fixture
    .usageEvent()
    .overwriteServiceLabel('unsupported-service')
    .get();
  const unsupportedServicePlanUsageEvent = fixture
    .usageEvent()
    .overwriteServicePlanName('unsupported-service-plan')
    .get();
  // const now = moment.now();
  // const tooYoungUsageEvent = fixture
  //   .usageEvent()
  //   .overwriteCreatedAt(moment
  //     .utc(now)
  //     .subtract(fixture.defaults.minimalAgeInMinutes / 2, 'minutes')
  //     .valueOf())
  //   .get();

  return [
    unsupportedOrganzationUsageEvent,
    unsupportedStateUsageEvent,
    unsupportedServiceUsageEvent,
    unsupportedServicePlanUsageEvent
    // tooYoungUsageEvent
  ];
};

describe('services-bridge unhandleable events tests', () => {

  unhandleableEventsTestsDefinition
    .fixture(createServicesFixture())
    .before(stubCloudControllerServices)
    .unhandleableEvents(unhandleableEvents)
    .build();

});

