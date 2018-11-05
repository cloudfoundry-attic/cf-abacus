'use strict';

/* eslint-disable max-len */

const { extend } = require('underscore');

const lifecycleManager = require('abacus-lifecycle-manager')();
const moment = require('abacus-moment');

const { createStatsReader } = require('abacus-test-helper');

const env = {
  tokenSecret: 'secret',
  tokenAlgorithm: 'HS256',
  abacusClientId: 'abacus-collector-client-id',
  abacusClientSecret: 'abacus-collector-client-secret',
  retryCount: 3
};

const port = 9501;

const hourInMillis = 3600000;

// There may be a case where the test is run at the very last moment of the month
// and until the renewer starts up, we enter into the next month, which causes our tests
// to fail. In order to avoid such a scenario, we check if we are in the last hour of the month
// and we roll back the clock of the renewer through the `ABACUS_TIME_OFFSET` env variable
// to assure that tests work as expected.
const now = moment.now();
const isLastHourOfCurrentMonth = () =>
  now >
    moment
      .utc(now)
      .endOf('month')
      .subtract(1, 'hour')
      .valueOf() &&
  now <=
    moment
      .utc(now)
      .endOf('month')
      .valueOf();

// Use value larger then the months' length in order to force renewer to start
// independently of current date (renewer starts working only if current date
// is before "start of month + slack")
const slack = '32D';

const getEnviornmentVars = (externalSystems) => ({
  ABACUS_CLIENT_ID: env.abacusClientId,
  ABACUS_CLIENT_SECRET: env.abacusClientSecret,
  SECURED: 'true',
  AUTH_SERVER: externalSystems.cloudController.url(),
  API: externalSystems.cloudController.url(),
  COLLECTOR: externalSystems.abacusCollector.url(),
  JWTKEY: env.tokenSecret,
  JWTALGO: env.tokenAlgorithm,
  RETRIES: env.retryCount,
  ABACUS_TIME_OFFSET: isLastHourOfCurrentMonth() ? -hourInMillis : 0,
  SLACK: slack
});

module.exports = (customEnv) => ({
  env,
  readStats: createStatsReader({
    port,
    tokenSecret: env.tokenSecret
  }),
  start: (externalSystemsMocks) => {
    externalSystemsMocks
      .cloudController
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());
    const renewerEnv = extend({}, process.env, getEnviornmentVars(externalSystemsMocks), customEnv);
    lifecycleManager.useEnv(renewerEnv).startModules([lifecycleManager.modules.renewer]);
  },
  stop: lifecycleManager.stopAllStarted
});
