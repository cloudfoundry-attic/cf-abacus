'use strict';

const abacusCollectorDownTestsDefinition = require('./test-definitions/abacus-collector-down-test-def');
const createApplicationFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge abacus collector down tests', () => {

  abacusCollectorDownTestsDefinition
    .fixture(createApplicationFixture())
    .build();

});

