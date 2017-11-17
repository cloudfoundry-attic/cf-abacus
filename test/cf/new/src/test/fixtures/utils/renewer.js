'use strict';

const extend = require('underscore').extend;

const npm = require('abacus-npm');

const env = {
  tokenSecret: 'secret',
  tokenAlgorithm: 'HS256',
  abacusClientId: 'abacus-collector-client-id',
  abacusClientSecret: 'abacus-collector-client-secret',
  retryCount: 3
};

const getEnviornmentVars = (abacusCollector, uaaServer) => ({
  ABACUS_CLIENT_ID: env.abacusClientId,
  ABACUS_CLIENT_SECRET: env.abacusClientSecret,
  SECURED : 'true',
  AUTH_SERVER : `http://localhost:${uaaServer.address().port}`,
  COLLECTOR : `http://localhost:${abacusCollector.address().port}`,
  JWTKEY : env.tokenSecret,
  JWTALGO : env.tokenAlgorithm,
  RETRIES: env.retryCount
});

module.exports = (customEnv) => ({
  port: 9501,
  env,
  start: (abacusCollector, uaaServer, done) => {
    const renewerEnv = extend({},
      process.env,
      getEnviornmentVars(abacusCollector, uaaServer),
      customEnv
    );
    npm
      .useEnv(renewerEnv)
      .startModules([npm.modules.renewer], done);
  },
  stop: (done) => npm.stopAllStarted(done)
});
