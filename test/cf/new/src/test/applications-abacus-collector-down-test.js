'use strict';

const abacusCollectorDownTestsDefinition = require('./test-definitions/abacus-collector-down-test-def');
const applicationFixture = require('./fixtures/applications-bridge-fixture');

describe('applications-bridge abacus collector down tests', () => {

  abacusCollectorDownTestsDefinition
    .fixture(applicationFixture)
    .build();

});

