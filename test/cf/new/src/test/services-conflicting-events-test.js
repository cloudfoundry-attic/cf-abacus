'use strict';

const conflictingEventsTestsDefinition = require('./test-definitions/conflicting-events-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

describe('services-bridge conflicting events tests', () => {

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  conflictingEventsTestsDefinition
    .fixture(servicesFixture)
    .build();
});

