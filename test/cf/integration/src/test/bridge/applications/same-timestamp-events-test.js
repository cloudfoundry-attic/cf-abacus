'use strict';

/* eslint-disable max-len */

const sameTimestampEventsTestsDefinition = require('../test-definitions/same-timestamp-events-test-def');
const applicationFixture = require('./fixture');

describe('applications-bridge unhandleable events tests', () => {
  sameTimestampEventsTestsDefinition.fixture(applicationFixture).build();
});
