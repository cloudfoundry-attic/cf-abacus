'use strict';

const statsAuthTestsDefinition = require('./test-definitions/stats-auth-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

describe('services-bridge stats auth tests', () => {

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  statsAuthTestsDefinition
    .fixture(servicesFixture)
    .build();
});

