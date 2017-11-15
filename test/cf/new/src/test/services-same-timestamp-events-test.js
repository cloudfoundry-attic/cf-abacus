'use strict';

const sameTimestampEventsTestsDefinition = require('./test-definitions/same-timestamp-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
  });
};

describe('services-bridge unhandleable events tests', () => {

  sameTimestampEventsTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

