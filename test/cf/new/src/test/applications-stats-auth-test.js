'use strict';

const statsAuthTestsDefinition = require('./test-definitions/stats-auth-test-def');
const createApplicationsFixture = require('./lib/applications-bridge-fixture');

describe('applications-bridge stats auth tests', () => {

  statsAuthTestsDefinition
    .fixture(createApplicationsFixture())
    .build();
});

