'use strict';

const url = require('url');

const routes = require('abacus-router')();
const webapp = require('abacus-webapp');
const oauth = require('abacus-oauth');
const throttle = require('abacus-throttle');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const request = breaker(retry(require('abacus-request')));
const yieldable = require('abacus-yieldable');
const appuri = require('abacus-dataflow').sink;
const uriurl = require('abacus-urienv').url;
const tmap = yieldable(require('abacus-transform').map);

const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('e-abacus-healthchecker');

const api = process.env.CF_API;
const domain = process.env.CF_DOMAIN;
const protocol = url.parse(api).protocol;

const credentials = 'Basic ' + new Buffer(process.env.CLIENT_ID
  + ':' + process.env.CLIENT_SECRET).toString('base64');

const scopes = process.env.CLIENT_SCOPES;
const secured = process.env.SECURED === 'true';

const authHeader = () => secured ?
  { headers: { Authorization: credentials } } : {};

const parseAppGroups = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {
    edebug('Unable to parse APPLICATION_GROUPS %j due to %o', string, e);
    return undefined;
  }
};

const applicationGroups = parseAppGroups(process.env.APPLICATION_GROUPS);

const generateGroupUri = (name) => {
  // if there isn't apps domain use uri env
  if (domain)
    return `${protocol}//${name}.${domain}`;
  return uriurl(name);
};

const generateAppGroupUris = function*(groupName, appsCount) {
  let resultUris = [];
  for (let i = 0; i < appsCount; i++) {
    const uriPartition = () => function*() {
      return appsCount > 1 ? [i] : false;
    };
    const groupUri = generateGroupUri(groupName);
    // Build app uri reusing the dataflow sink with custom partition
    const appUri = yield appuri(undefined, groupUri, uriPartition);
    resultUris.push(appUri);
  }
  return resultUris;
};

const getApplicationHealth = (appUri, index, appUris, cb) => {
  debug('Getting app %s health.', appUri);
  return request.get(`${appUri}/healthcheck`,
    authHeader(),
    (err, response) => {
      if (err) {
        edebug('App %s returns an error %o', appUri, err);
        cb(undefined, httpStatus.INTERNAL_SERVER_ERROR);
        return;
      }
      debug('App %s returns statusCode %o', appUri, response.statusCode);
      cb(undefined, response.statusCode);
    });
};

const getAppGroupHealth = function*(name, index, appGroups) {
  const appCount = applicationGroups[name];
  const groupHealth = {};

  const appUris = yield generateAppGroupUris(name, appCount);

  const appStatusCodes = yield tmap(appUris, getApplicationHealth);

  for (let i = 0; i < appUris.length ; i++)
    groupHealth[appUris[i]] = appStatusCodes[i];
  return groupHealth;
};

const checkApplicationsHealth = function*(applicationGroups) {
  const groupNames = Object.keys(applicationGroups);
  debug('Checking application groups health %o', groupNames);
  const groupsHealth = yield tmap(groupNames, getAppGroupHealth);

  const applicationsHealth = {};
  for (let i = 0; i < groupNames.length ; i++)
    applicationsHealth[groupNames[i]] = groupsHealth[i];

  return applicationsHealth;
};

routes.get('/v1/healthcheck', throttle(function*(req, res) {
  if (applicationGroups) {
    const healthStatus = yield checkApplicationsHealth(applicationGroups);
    return {
      status: httpStatus.OK,
      body: healthStatus
    };
  }
  return {
    status: httpStatus.INTERNAL_SERVER_ERROR
  };
}));

const healthchecker = () => {
  const app = webapp();

  if(secured)
    app.use(oauth.basicStrategy(api, scopes, process.env.JWTKEY,
      process.env.JWTALGO));

  app.use(routes);

  return app;
};

const startApp = () => {
  debug('Starting healthchecker app...');
  const app = healthchecker();
  app.listen();
};

const runCLI = () => {
  startApp();
};

module.exports = healthchecker;
module.exports.runCLI = runCLI;
