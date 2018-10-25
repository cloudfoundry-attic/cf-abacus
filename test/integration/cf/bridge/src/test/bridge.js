'use strict';
/* eslint-disable max-len */

const { extend } = require('underscore');

const { createStatsReader } = require('abacus-test-helper');
const lifecycleManager = require('abacus-lifecycle-manager')();

const env = {
  tokenSecret: 'secret',
  tokenAlgorithm: 'HS256',
  cfClientId: 'cf-client-id',
  cfClientSecret: 'cf-client-secret',
  abacusClientId: 'abacus-collector-client-id',
  abacusClientSecret: 'abacus-collector-client-secret',
  minimalAgeInMinutes: 3,
  retryCount: 3
};

const getEnviornmentVars = (externalSystems) => ({
  CLIENT_ID: env.abacusClientId,
  CLIENT_SECRET: env.abacusClientSecret,
  CF_CLIENT_ID: env.cfClientId,
  CF_CLIENT_SECRET: env.cfClientSecret,
  SECURED: 'true',
  AUTH_SERVER: externalSystems.cloudController.url(),
  API: externalSystems.cloudController.url(),
  COLLECTOR: externalSystems.abacusCollector.url(),
  MIN_INTERVAL_TIME: 10,
  JWTKEY: env.tokenSecret,
  JWTALGO: env.tokenAlgorithm,
  RETRIES: env.retryCount,
  GUID_MIN_AGE: env.minimalAgeInMinutes * 60 * 1000
});

module.exports = (config) => ({
  port: config.port,
  env,
  readStats: createStatsReader({
    port: config.port,
    tokenSecret: env.tokenSecret
  }),
  start: (externalSystemsMocks) => {
    externalSystemsMocks
      .cloudController
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());

    const bridgeEnv = extend({}, process.env, getEnviornmentVars(externalSystemsMocks), config.customEnv);

    lifecycleManager.useEnv(bridgeEnv).startModules([config.bridge]);
  },
  stop: lifecycleManager.stopAllStarted
});
