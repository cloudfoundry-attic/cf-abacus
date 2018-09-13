'use strict';

const healthcheckTestsDefinition = require('../test-definitions/healthcheck-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge healthcheck tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  healthcheckTestsDefinition.fixture(servicesFixture).build();
});
