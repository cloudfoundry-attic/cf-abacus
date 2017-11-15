'use strict';

const unhandleableEventsTestsDefinition = require('./test-definitions/unhandled-events-test-def');
const applicationFixture = require('./lib/applications-bridge-fixture');

const unhandleableEvents = (fixture) => {
  const unsupportedOrganzationUsageEvent = fixture
    .usageEvent()
    .overwriteOrgGuid('unsupported')
    .get();
  const unsupportedStateUsageEvent = fixture
    .usageEvent()
    .overwriteState('UNSUPPORTED')
    .get();
  // const now = moment.now();
  // const tooYoungUsageEvent = fixture
  //   .usageEvent()
  //   .overwriteCreatedAt(moment
  //     .utc(now)
  //     .subtract(fixture.defaults.minimalAgeInMinutes / 2, 'minutes')
  //     .valueOf())
  //   .get();

  return [
    unsupportedOrganzationUsageEvent,
    unsupportedStateUsageEvent
    // tooYoungUsageEvent
  ];
};

describe('applications-bridge unhandleable events tests', () => {

  unhandleableEventsTestsDefinition
    .fixture(applicationFixture)
    .unhandleableEvents(unhandleableEvents)
    .build();

});

