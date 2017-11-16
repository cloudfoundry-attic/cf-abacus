'use strict';

const sameTimestampEventsTestsDefinition = require('./test-definitions/same-timestamp-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

describe('services-bridge unhandleable events tests', () => {

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  sameTimestampEventsTestsDefinition
    .fixture(servicesFixture)
    .build();
});

