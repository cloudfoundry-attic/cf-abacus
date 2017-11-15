'use strict';

const abacusCollectorDownTestsDefinition = require('./test-definitions/abacus-collector-down-test-def');
const applicationFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge abacus collector down tests', () => {

  abacusCollectorDownTestsDefinition
    .fixture(applicationFixture)
    .build();

});

