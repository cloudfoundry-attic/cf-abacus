'use strict';

/* istanbul ignore file */

const router = require('abacus-router');
const throttle = require('abacus-throttle');
const webapp = require('abacus-webapp');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const cluster = require('abacus-cluster');

const keys = require('underscore').keys;

// Create an express router
const routes = router();

// Resolve service URIs
const uris = urienv({
  api: 80,
  uaa: 443,
  collector: 9080
});

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge');

const reportingInterval = 10000;

/* eslint no-var: 0 */
var oauthToken;
var lastRecorded;
var appUsage = {};

routes.get('/v1/cf/bridge', throttle(function *(req) {
  const doc = 'Hello';
  return {
    body: doc
  };
}));

const obtainToken = (callback) => {
  const clientId = 'bridge';
  const secret = 'secret';

  request.get(':uaa/oauth/token?grant_type=client_credentials', {
    uaa: uris.uaa,
    auth: {
      user: clientId,
      password: secret
    }
  }, (error, response) => {
    if (error) {
      console.warn('Cannot obtain token from %s; error %s; response code %s',
        uris.uaa, error, response ? response.statusCode : 'unknown');
      // TODO: use retry to get rid of 1s timeout
      const refreshTokenTimeout = setTimeout(obtainToken, 1000, callback);
      callback(error, refreshTokenTimeout);
      return;
    }

    if (response.statusCode === 200) {
      debug('Token refreshed successfully');
      oauthToken = response.body.token_type + ' ' + response.body.access_token;
      const timeout = Math.max(response.body.expires_in - 15000, 0);
      debug('Token will be refreshed in %dms', timeout);
      const refreshTokenTimeout = setTimeout(obtainToken, timeout, callback);
      callback(null, oauthToken, refreshTokenTimeout);
      return;
    }

    // TODO: use retry to get rid of 1s timeout
    setTimeout(obtainToken, 1000, callback);
    callback('Unexpected response ' + response.statusCode);
  });
};

const readAppUsage = (processResponse, nextPageUri=null) => {
  debug('Token: %j', oauthToken);
  debug('API: %s', uris.api);
  if (!oauthToken) {
    debug('No token generated');
    return;
  }

  let uri = nextPageUri ? ':api' + nextPageUri :
    ':api/v2/app_usage_events?order-direction=asc&results-per-page=50';

  if (lastRecorded && !nextPageUri)
    uri += '&after_guid=' + lastRecorded;

  debug('Requesting page: %s', uri);

  request.get(uri, {
    api: uris.api,
    headers: {
      Authorization: oauthToken
    },
    json: true
  }, (error, response) => {
    if (error) {
      console.warn('Cannot fetch usage from %s; error %s; response code %s',
        uris.api, error, response ? response.statusCode : 'unknown');
      return;
    }

    if (response.statusCode === 401) {
      console.log('\n');
      console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.log('! Unauthorized, please create "bridge" client !');
      console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.log(response.body);
      console.log('\n');
    }
    if (response.statusCode === 200)
      processResponse(response.body);
  });
};

const forEachResource = (processResources) => {
  return (resources) => {
    let i;
    for (i = 0; i < resources.length; i++)
      processResources(resources[i]);

    debug('Number of apps: %d', keys(appUsage).length);
    let totalResources =
      keys(appUsage).map((e) => appUsage[e].length).reduce((sum, e) => sum + e);
    debug('Total number of resources: %d', totalResources);
  };
};

const saveResourceUsageEvent = (resource) => {
  let resourceId = resource.entity.app_guid;
  if(!appUsage[resourceId])
   appUsage[resourceId] = [];
  appUsage[resourceId].push(resource);
  lastRecorded = resource.metadata.guid;

  let map = keys(appUsage).reduce((m, e) => {
    m[e] = appUsage[e].length;
    return m;
  }, {});
  debug('<app_guid>:<resources #> list: %j', map);
};

// TODO: should accept callback to notify in case of problem
const reportUsage = (usage) => {
  debug('Reporting usage: \n%j\n', usage);

  request.post(':collector/v1/metering/resource/usage', {
    collector: uris.collector,
    body: usage.usage
  }, (error, response) => {
    if (!error && response.statusCode === 201)
      debug('Successfully reported usage %j with headers %j',
        usage, response.headers);
    else
      debug('Failed reporting\n\tusage %j\n\terror %j\n\tresponse %j',
        usage, error, response);
  });
};

const foreachPage = (processPage) => {
  return (body) => {
    if (body.resources.length === 0) {
      debug('No resources to process');
      return;
    }

    debug('Iterating a page of %d resources...', body.resources.length);
    processPage(body.resources);
    if (body.next_url) {
      debug('Processing page #%s...', body.next_url);
      readAppUsage(
        foreachPage(forEachResource(saveResourceUsageEvent)),
        body.next_url);
    }
  };
};

const reportAppUsage = () => {
  // Match & report recorded usage data
  keys(appUsage).forEach((appGuid) => {
    let appEvents = appUsage[appGuid];
    debug('Processing app %s: %j', appGuid, appEvents);
    for (var i = 0; i < appEvents.length - 1; i++) {
      const event = appEvents[i];
      debug('Processing event %j', event);

      const memBytes = event.entity.memory_in_mb_per_instance * 1048576;
      const eventTime = Date.parse(event.metadata.created_at);

      if (event.entity.state === 'STOPPED')
        reportUsage({
          usage: {
            usage: [{
              start: eventTime,
              end: eventTime,
              region: 'eu-gb',
              organization_id: event.entity.org_guid,
              space_id: event.entity.space_guid,
              resource_id: 'linux-container',
              plan_id: 'basic',
              resource_instance_id: event.entity.app_guid,
              measured_usage: [
                {
                  measure: 'instance_memory',
                  quantity: 0
                },
                {
                  measure: 'running_instances',
                  quantity: 0
                }
              ]
            }]
          }
        });
      else
        reportUsage({
          usage: {
            usage: [{
              start: eventTime,
              end: eventTime,
              region: 'eu-gb',
              organization_id: event.entity.org_guid,
              space_id: event.entity.space_guid,
              resource_id: 'linux-container',
              plan_id: 'basic',
              resource_instance_id: event.entity.app_guid,
              measured_usage: [
                {
                  measure: 'instance_memory',
                  quantity: memBytes
                },
                {
                  measure: 'running_instances',
                  quantity: event.entity.instance_count
                }
              ]
            }]
          }
        });

      const removedEvents = appEvents.splice(i--, 1);
      debug('Removed reported event %j', removedEvents);
    }

  });
};

const scheduleUsageReporting = () => {
  debug('First attempt ro obtain token due in 200ms');
  const tokenRefresher = setTimeout(obtainToken, 200,
    (err, token) => debug('Callback: %j %s', err, token));

  const usageEventPoller = setInterval(function() {
    // Record usage data in local list
    readAppUsage(foreachPage(forEachResource(saveResourceUsageEvent)));
  }, 5000);

  const usageReporter = setInterval(reportAppUsage, reportingInterval);

  // Cancel scheduled timers
  process.on('exit', () => {
    debug('Cancelling timers');
    clearTimeout(tokenRefresher);
    clearInterval(usageEventPoller);
    clearInterval(usageReporter);
  });
};

// Create a bridge app
const bridge = () => {
  cluster.singleton();

  if (cluster.isWorker()) {
    debug('Starting bridge worker');
    scheduleUsageReporting();
  }

  // Create the Webapp
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));

  return app;
};

// Command line interface, create the bridge app and listen
const runCLI = () => bridge().listen();

// Export our public functions
module.exports = bridge;
module.exports.obtainToken = obtainToken;
module.exports.runCLI = runCLI;
module.exports.oauthToken = oauthToken;
