'use strict';

const { iindex } = require('abacus-vcapenv');
const oauth = require('abacus-oauth');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');

const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('e-abacus-healthchecker');

const createRouter = require('abacus-router');
const createHealthchecker = require('./lib/healthchecker');
const createAppsUrisBuilder = require('./lib/apps-uris-builder');
const createHealthcheckFilter = require('./lib/healthcheck-filter');
const createApplicationHealthClient = require('./lib/app-health-client');

const uris = urienv({
  cf_api: 9882
});

const baseRefreshIntervalMs = parseInt(process.env.REFRESH_INTERVAL) || 15000;

// Interleave health-checks between application instances
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const refreshIntervalMs = () => getRandomInt(baseRefreshIntervalMs, baseRefreshIntervalMs * iindex() + 1);

const secured = process.env.SECURED === 'true';

const defaultEnv = {
  applicationGroups: {
    'collector': 1,
    'meter': 1,
    'accumulator': 1,
    'aggregator': 1,
    'reporting': 1,
    'account': 1,
    'provisioning': 1,
    'eureka': 1,
    'auth_server': 1
  },
  internalApplications: [
    'meter',
    'renewer',
    'aggregator',
    'accumulator',
    'housekeeper',
    'eureka-plugin',
    'services-bridge',
    'service-dashboard',
    'applications-bridge'
  ]
};

const getEnv = (env) => {
  if (!env)
    return undefined;

  try {
    return JSON.parse(env);
  } catch (e) {
    debug('Unable to parse env "%j" due to %o', env, e);
    edebug('Unable to parse env "%j" due to %o', env, e);
    throw e;
  }
};

const fromEnv = {
  getApplicationGroups: () => getEnv(process.env.APPLICATION_GROUPS) || defaultEnv.applicationGroups,
  getInternalApplications: () => getEnv(process.env.INTERNAL_APPLICATIONS) || defaultEnv.internalApplications
};

const createHealthcheckRoute = (router, route, applicationsFilter, healthchecker) => {
  router.get(route, throttle(function*() {
    return {
      status: httpStatus.OK,
      body: applicationsFilter(healthchecker.getSystemHealth())
    };
  }));
};

const healthCheckerApplication = (healthChecker, healthCheckFilter) => {
  const app = webapp();
  const router = createRouter();

  if(secured)
    app.use('/v1/healthcheck', oauth.basicStrategy(uris.cf_api, process.env.CLIENT_SCOPES, process.env.JWTKEY,
      process.env.JWTALGO));

  createHealthcheckRoute(router, '/v1/healthcheck', healthCheckFilter.externalComponents, healthChecker);
  createHealthcheckRoute(router, '/v1/healthcheck/internal', healthCheckFilter.internalComponents, healthChecker);

  app.use(router);

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

const startApp = () => {
  debug('Starting health-checker app...');
  const applicationGroups = fromEnv.getApplicationGroups();
  const internalApplications = fromEnv.getInternalApplications();
  const applicationHealthClient = createApplicationHealthClient(credentials());
  const applicationsUrisBuilder = createAppsUrisBuilder(urienv);


  const healthChecker = createHealthchecker({
    applicationGroups,
    refreshIntervalMs: refreshIntervalMs()
  }, applicationHealthClient, applicationsUrisBuilder);

  const healthCheckFilter = createHealthcheckFilter(internalApplications);
  const app = healthCheckerApplication(healthChecker, healthCheckFilter);

  app.listen();
};

const runCLI = () => {
  startApp();
};

runCLI();
