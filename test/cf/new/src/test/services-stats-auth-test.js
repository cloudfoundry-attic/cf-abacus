'use strict';

const statsAuthTestsDefinition = require('./test-definitions/stats-auth-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
  });
};

describe('services-bridge stats auth tests', () => {

  statsAuthTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

