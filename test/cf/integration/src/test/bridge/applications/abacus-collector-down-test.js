'use strict';

/* eslint-disable max-len */

const abacusCollectorDownTestsDefinition = require('../test-definitions/abacus-collector-down-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge abacus collector down tests', () => {

  abacusCollectorDownTestsDefinition
    .fixture(applicationFixture)
    .build();

});

