'use strict';

const sameTimestampEventsTestsDefinition = require('./test-definitions/same-timestamp-events-test-def');
const createApplicationsFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge unhandleable events tests', () => {

  sameTimestampEventsTestsDefinition
    .fixture(createApplicationsFixture())
    .build();

});

