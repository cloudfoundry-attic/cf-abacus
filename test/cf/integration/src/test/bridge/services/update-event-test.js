'use strict';

const updateEventTestsDefinition = require('../test-definitions/update-event-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge update event tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  updateEventTestsDefinition.fixture(servicesFixture).build();
});
