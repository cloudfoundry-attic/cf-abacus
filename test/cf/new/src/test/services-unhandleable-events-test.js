'use strict';

const unhandleableEventsTestsDefinition = require('./test-definitions/unhandleable-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

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

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  unhandleableEventsTestsDefinition
    .fixture(servicesFixture)
    .unhandleableEvents(unhandleableEvents)
    .build();

});

