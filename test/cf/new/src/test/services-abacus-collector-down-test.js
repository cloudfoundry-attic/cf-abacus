'use strict';

const abacusCollectorDownTestsDefinition = require('./test-definitions/abacus-collector-down-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

describe('services-bridge abacus collector down tests', () => {

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  abacusCollectorDownTestsDefinition
    .fixture(servicesFixture)
    .build();
});

