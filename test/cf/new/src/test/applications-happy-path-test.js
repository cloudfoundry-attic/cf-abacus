'use strict';

const happyTestsDefinition = require('./test-definitions/happy-path-test-def');
const createApplicationFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge happy path tests', () => {

  happyTestsDefinition
    .fixture(createApplicationFixture())
    .build();

});
