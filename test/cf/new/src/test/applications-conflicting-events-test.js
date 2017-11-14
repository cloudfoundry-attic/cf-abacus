'use strict';

const conflictingEventsTestsDefinition = require('./test-definitions/conflicting-events-test-def');
const createApplicationFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge conflicting events tests', () => {

  conflictingEventsTestsDefinition
    .fixture(createApplicationFixture())
    .build();
});

