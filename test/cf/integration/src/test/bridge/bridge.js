'use strict';

const extend = require('underscore').extend;

const npm = require('abacus-npm')();

const createStatsReader = require('../utils/stats-reader');

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
  CF_CLIENT_ID : env.cfClientId,
  CF_CLIENT_SECRET : env.cfClientSecret,
  SECURED : 'true',
  AUTH_SERVER : `http://localhost:${externalSystems.uaaServer.address().port}`,
  API : `http://localhost:${externalSystems.cloudController.address().port}`,
  COLLECTOR : `http://localhost:${externalSystems.abacusCollector.address().port}`,
  MIN_INTERVAL_TIME : 10,
  JWTKEY : env.tokenSecret,
  JWTALGO : env.tokenAlgorithm,
  RETRIES: env.retryCount,
  GUID_MIN_AGE: env.minimalAgeInMinutes * 60 * 1000
});

module.exports = (config) => ({
  env,
  readStats: createStatsReader({
    port: config.port,
    tokenSecret: env.tokenSecret
  }),
  start: (externalSystemsMocks) => {
    const bridgeEnv = extend({},
      process.env,
      getEnviornmentVars(externalSystemsMocks),
      config.customEnv
    );

    npm
      .useEnv(bridgeEnv)
      .startModules([config.bridge]);
  },
  stop: npm.stopAllStarted
});
