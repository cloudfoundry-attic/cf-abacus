'use strict';

const happyTestsDefinition = require('../test-definitions/standard-flow-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge happy path tests', () => {

  happyTestsDefinition
    .fixture(applicationFixture)
    .build();

});
