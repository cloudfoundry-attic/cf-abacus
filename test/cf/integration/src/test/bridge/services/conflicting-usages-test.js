'use strict';

/* eslint-disable max-len */

const conflictingEventsTestsDefinition = require('../test-definitions/conflicting-events-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge conflicting events tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  conflictingEventsTestsDefinition.fixture(servicesFixture).build();
});
