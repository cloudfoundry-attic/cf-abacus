'use strict';

/* eslint-disable max-len */

const conflictingEventsTestsDefinition = require('../test-definitions/conflicting-events-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge conflicting events tests', () => {

  conflictingEventsTestsDefinition
    .fixture(applicationFixture)
    .build();
});

