'use strict';

const { iindex } = require('abacus-vcapenv');
const oauth = require('abacus-oauth');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');

const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('e-abacus-healthchecker');

const createRoutes = require('abacus-router');
const createHealthchecker = require('./lib/healthchecker');
const createAppsUrisBuilder = require('./lib/apps-uris-builder');
const createApplicationHealthClient = require('./lib/app-health-client');

const uris = urienv({
  cf_api: 9882
});

const baseRefreshIntervalMs = parseInt(process.env.REFRESH_INTERVAL) || 15000;

// Interleave health-checks between application instances
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const refreshIntervalMs = () => getRandomInt(baseRefreshIntervalMs, baseRefreshIntervalMs * iindex() + 1);

const secured = process.env.SECURED === 'true';

const defaultAppGroups = () => ({
  'collector': 1,
  'meter': 1,
  'accumulator': 1,
  'aggregator': 1,
  'reporting': 1,
  'account': 1,
  'provisioning': 1,
  'eureka': 1,
  'auth_server': 1
});

const getApplicationGroups = () => {
  if (!process.env.APPLICATION_GROUPS)
    return defaultAppGroups();

  try {
    return JSON.parse(process.env.APPLICATION_GROUPS);
  } catch (e) {
    debug('Unable to parse application groups "%j" due to %o', string, e);
    edebug('Unable to parse application groups "%j" due to %o', string, e);
    throw e;
  }
};

const createHealthcheckRoute = (healthchecker) => {
  const routes = createRoutes();
  routes.get('/v1/healthcheck', throttle(function*() {
    return {
      status: httpStatus.OK,
      body: healthchecker.getSystemHealth()
    };
  }));

  return routes;
};

const healthcheckerApplication = (healthchecker) => {
  const app = webapp();

  if(secured)
    app.use(oauth.basicStrategy(uris.cf_api, process.env.CLIENT_SCOPES, process.env.JWTKEY,
      process.env.JWTALGO));

  const healthcheckRoute = createHealthcheckRoute(healthchecker);
  app.use(healthcheckRoute);

  return app;
};

const credentials = () => {
  if (!secured)
    return undefined;

  return {
    client: process.env.CLIENT_ID,
    secret: process.env.CLIENT_SECRET
  };
};

const startApp = async() => {
  debug('Starting healthchecker app...');
  const applicationGroups = getApplicationGroups();
  const applicationHealthClient = createApplicationHealthClient(credentials());
  const applicationsUrisBuilder = createAppsUrisBuilder(urienv);
  
  
  const healthchecker = createHealthchecker({
    applicationGroups, 
    refreshIntervalMs: refreshIntervalMs()
  }, applicationHealthClient, applicationsUrisBuilder);

  const app = healthcheckerApplication(healthchecker);

  app.listen();
};

const runCLI = async() => {
  await startApp();
};

module.exports.runCLI = runCLI;
