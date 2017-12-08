'use strict';

/* eslint-disable max-len */

const sameTimestampEventsTestsDefinition = require('../test-definitions/same-timestamp-events-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge unhandleable events tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  sameTimestampEventsTestsDefinition.fixture(servicesFixture).build();
});
