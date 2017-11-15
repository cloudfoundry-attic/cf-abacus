'use strict';

const abacusCollectorDownTestsDefinition = require('./test-definitions/abacus-collector-down-test-def');
const servicesFixture = require('./lib/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
  });
};

describe('services-bridge abacus collector down tests', () => {

  abacusCollectorDownTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .build();
});

