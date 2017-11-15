'use strict';

const conflictingEventsTestsDefinition = require('./test-definitions/conflicting-events-test-def');
const servicesFixture = require('./lib/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
  });
};

describe('services-bridge conflicting events tests', () => {

  conflictingEventsTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

