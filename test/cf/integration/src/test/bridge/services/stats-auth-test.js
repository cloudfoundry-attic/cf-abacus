'use strict';

/* eslint-disable max-len */

const statsAuthTestsDefinition = require('../test-definitions/stats-auth-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge stats auth tests', () => {
  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  statsAuthTestsDefinition.fixture(servicesFixture).build();
});
