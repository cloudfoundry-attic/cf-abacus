'use strict';

const happyTestsDefinition = require('../test-definitions/happy-path-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge happy path tests', () => {

  happyTestsDefinition
    .fixture(applicationFixture)
    .build();

});
