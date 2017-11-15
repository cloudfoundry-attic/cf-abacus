'use strict';

const happyTestsDefinition = require('./test-definitions/happy-path-test-def');
const applicationFixture = require('./fixtures/applications-bridge-fixture');

describe('applications-bridge happy path tests', () => {

  happyTestsDefinition
    .fixture(applicationFixture)
    .build();

});
