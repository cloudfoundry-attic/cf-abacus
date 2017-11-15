'use strict';

const conflictingEventsTestsDefinition = require('./test-definitions/conflicting-events-test-def');
const applicationFixture = require('./fixtures/applications-bridge-fixture');

describe('applications-bridge conflicting events tests', () => {

  conflictingEventsTestsDefinition
    .fixture(applicationFixture)
    .build();
});

