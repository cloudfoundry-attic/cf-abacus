'use strict';

/* eslint-disable max-len */

const abacusCollectorDownTestsDefinition = require('../test-definitions/abacus-collector-down-test-def');
const servicesFixture = require('./fixture');

describe('services-bridge abacus collector down tests', () => {

  before(() => {
    servicesFixture.externalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  abacusCollectorDownTestsDefinition
    .fixture(servicesFixture)
    .build();
});

