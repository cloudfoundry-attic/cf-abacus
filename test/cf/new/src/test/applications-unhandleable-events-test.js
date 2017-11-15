'use strict';

const unhandleableEventsTestsDefinition = require('./test-definitions/unhandleable-events-test-def');
const applicationFixture = require('./fixtures/applications-bridge-fixture');

const unhandleableEvents = (fixture) => {
  const unsupportedOrganzationUsageEvent = fixture
    .usageEvent()
    .overwriteOrgGuid('unsupported')
    .get();
  const unsupportedStateUsageEvent = fixture
    .usageEvent()
    .overwriteState('UNSUPPORTED')
    .get();

  return [
    unsupportedOrganzationUsageEvent,
    unsupportedStateUsageEvent
  ];
};

describe('applications-bridge unhandleable events tests', () => {

  unhandleableEventsTestsDefinition
    .fixture(applicationFixture)
    .unhandleableEvents(unhandleableEvents)
    .build();

});

