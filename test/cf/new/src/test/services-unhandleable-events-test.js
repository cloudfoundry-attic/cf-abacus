'use strict';

const unhandleableEventsTestsDefinition = require('./test-definitions/unhandleable-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
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

  return [
    unsupportedOrganzationUsageEvent,
    unsupportedStateUsageEvent,
    unsupportedServiceUsageEvent,
    unsupportedServicePlanUsageEvent
  ];
};

describe('services-bridge unhandleable events tests', () => {

  unhandleableEventsTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .unhandleableEvents(unhandleableEvents)
    .build();

});

