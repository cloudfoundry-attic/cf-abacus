'use strict';

const conflictingEventsTestsDefinition = require('./test-definitions/conflicting-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
  });
};

describe('services-bridge conflicting events tests', () => {

  conflictingEventsTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

