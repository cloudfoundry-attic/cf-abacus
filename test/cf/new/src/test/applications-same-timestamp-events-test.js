'use strict';

const sameTimestampEventsTestsDefinition = require('./test-definitions/same-timestamp-events-test-def');
const applicationFixture = require('./fixtures/applications-bridge-fixture');

describe('applications-bridge unhandleable events tests', () => {

  sameTimestampEventsTestsDefinition
    .fixture(applicationFixture)
    .build();

});

