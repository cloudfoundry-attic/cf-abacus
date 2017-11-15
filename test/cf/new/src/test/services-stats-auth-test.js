'use strict';

const statsAuthTestsDefinition = require('./test-definitions/stats-auth-test-def');
const servicesFixture = require('./lib/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
  });
};

describe('services-bridge stats auth tests', () => {

  statsAuthTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

