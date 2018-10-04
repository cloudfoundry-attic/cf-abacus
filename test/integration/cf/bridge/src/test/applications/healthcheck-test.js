'use strict';

const healthcheckTestsDefinition = require('../test-definitions/healthcheck-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge healthcheck tests', () => {
  healthcheckTestsDefinition.fixture(applicationFixture).build();
});
