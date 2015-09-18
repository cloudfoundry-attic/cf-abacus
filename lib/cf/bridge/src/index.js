'use strict';

const router = require('abacus-router');
const throttle = require('abacus-throttle');
const webapp = require('abacus-webapp');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const cluster = require('abacus-cluster');

const _ = require('underscore');
const keys = _.keys;
const head = _.head;
const tail = _.tail;
const uniq = _.uniq;

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = urienv({
  api: 80,
  uaa: 443,
  collector: 9080
});

const cache = {
  oauthToken: null,
  appUsage: {},
  apps: [],
  lastRecordedGUID: null,
  lastCompensatedGUID: null
};

const reportingInterval = 10000;
const guidMaxAge = 60000;

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
      debug('Cannot obtain token from %s; error %s; response code %s',
        uris.uaa, error, response ? response.statusCode : 'unknown');
      module.tokenRefresher = setTimeout(obtainToken, 3000, callback);
      callback(error, null);
      return;
    }

    if (response.statusCode === 200) {
      debug('Token refreshed successfully');
      cache.oauthToken = response.body.token_type + ' ' +
        response.body.access_token;
      const timeout = Math.max(response.body.expires_in - 15000, 0);
      debug('Token will be refreshed in %dms', timeout);
      module.tokenRefresher = setTimeout(obtainToken, timeout, callback);
      callback(null, cache.oauthToken);
      return;
    }

    module.tokenRefresher = setTimeout(obtainToken, 3000, callback);
    callback('Unexpected response ' + response.statusCode, null);
  });
};

const readResourceList = (processPage, uriFn, nextPageUri=null,
cb = () => {}) => {
  debug('Reading app usage with token: %j from %s',
    cache.oauthToken, uris.api);
  if (!cache.oauthToken) {
    debug('No token generated');
    cb('MissingToken');
    return;
  }

  const uri = uriFn(nextPageUri);
  debug('Requesting page: %s', request.route(uri, {api: uris.api}));

  request.get(uri, {
    api: uris.api,
    headers: {
      Authorization: cache.oauthToken
    },
    json: true
  }, (error, response) => {
    if (error) {
      debug('Cannot fetch usage from %s; error %s; response code %s',
        uris.api, error, response ? response.statusCode : 'unknown');
      cb(error, response, uri);
      return;
    }

    if (response.statusCode === 401)
      debug('Unauthorized, please create "bridge" client. Response: %j',
        response.body);
    if (response.statusCode === 200)
      processPage(response.body, null, cb);

    cb(null, response, uri);
  });
};

const foreachPage = (processPage, processNextPage, cb) => {
  return (body) => {
    if (body.resources.length === 0) {
      debug('No resources to process');
      return;
    }

    debug('Iterating a page of %d resources...', body.resources.length);
    processPage(body.resources);
    if (body.next_url) {
      debug('Processing page %s...', body.next_url);
      processNextPage(body.next_url, cb);
    }
  };
};

const forEachResource = (processResource) => {
  return (resources) => {
    if (resources.length === 0)
      return;

    processResource(head(resources), (error) => {
      if (!error)
        forEachResource(processResource)(tail(resources));
    });
  };
};

/**
 * "The list of usage events returned from the API is not guaranteed to be
 * complete. Events may still be processing at the time of the query, so
 * events that occurred before the final event may still appear
 * [...]
 * it is recommended that operators select their ‘after_guid’ from an event
 * far enough back in time to ensure that all events have been processed"
 *
 * https://www.cloudfoundry.org/how-to-bill-on-cloud-foundry/
 */
const storeElderGuid = (resource) => {
  const now = new Date().getTime();
  const resourceDate = new Date(resource.metadata.created_at);
  const age = now - resourceDate.getTime();

  // Update stored guid only if old enough
  if (age > guidMaxAge) {
    cache.lastRecordedGUID = resource.metadata.guid;
    debug('Last processed guid set to %s with time-stamp %s',
      cache.lastRecordedGUID, resourceDate.toISOString());
  }
};

const saveResourceUsageEvent = (resource, cb) => {
  let resourceId = resource.entity.app_guid;
  if(!cache.appUsage[resourceId])
   cache.appUsage[resourceId] = [];
  cache.appUsage[resourceId].push(resource);

  storeElderGuid(resource);

  let map = keys(cache.appUsage).reduce((m, e) => {
    m[e] = cache.appUsage[e].length;
    return m;
  }, {});
  debug('<app_guid>:<resources #> list: %j', map);

  cb(null);
};

const reportUsage = (usage, cb = () => {}) => {
  debug('Reporting usage: \n%j\n', usage);

  request.post(':collector/v1/metering/resource/usage', {
    collector: uris.collector,
    body: usage.usage
  }, (error, response) => {
    if (!error && response.statusCode === 201) {
      debug('Successfully reported usage %j with headers %j',
        usage, response.headers);
      cb(error, response);
    }
    else {
      debug('Failed reporting\n\tusage %j\n\terror %j\n\tresponse %j',
        usage, error, response);
      cb(error, response);
    }
  });
};

const appUsageUri = (nextPageUri) => {
  let uri = nextPageUri ? ':api' + nextPageUri :
    ':api/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastRecordedGUID)
    uri += '&after_guid=' + cache.lastRecordedGUID;

  return uri;
};

const readNextUsagePage = (nextUrl, cb) => {
  readResourceList(
    foreachPage(forEachResource(saveResourceUsageEvent), readNextUsagePage, cb),
    () => appUsageUri(nextUrl), null, cb);
};

const readUsage = (cb) => {
  readResourceList(
    foreachPage(forEachResource(saveResourceUsageEvent), readNextUsagePage, cb),
    appUsageUri, null, cb);
};

const getAppUsage = (event, stopped = false) => {
  const memBytes = event.entity.memory_in_mb_per_instance * 1048576;
  const eventTime = Date.parse(event.metadata.created_at);
  const stopEvent = stopped || event.entity.state === 'STOPPED';

  return {
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
            quantity: stopEvent ? 0 : memBytes
          },
          {
            measure: 'running_instances',
            quantity: stopEvent ? 0 : event.entity.instance_count
          }
        ]
      }]
    }
  };
};

const reportSingleAppUsage = (appGuid, events, cb) => {
  if (events.length === 0) {
    delete cache.appUsage[appGuid];
    debug('All events processed for application %s', appGuid);
    return;
  }

  const event = head(events);
  debug('Processing app: %s event: %j', appGuid, event);

  reportUsage(getAppUsage(event), (error, response) => {
    if (!error && response.statusCode === 201) {
      debug('Scheduling reported event %j for removal ...', head(events));
      reportSingleAppUsage(appGuid, tail(events), cb);
      cb(error, response);
    } else
    cb(error, response);
  });
};

const reportAppsUsage = (cb = () => {}) => {
  const appGuids = keys(cache.appUsage);
  if (appGuids.length === 0) {
    debug('No usage events to report');
    return;
  }

  appGuids.forEach((appGuid) => {
    let appEvents = cache.appUsage[appGuid];
    reportSingleAppUsage(appGuid, appEvents, cb);
  });
};

const stopReporting = () => {
  debug('Cancelling timers');
  clearTimeout(module.tokenRefresher);
  clearTimeout(module.appsReader);
  clearTimeout(module.purgeCompensation);
  clearInterval(module.usageEventPoller);
  clearInterval(module.usageReporter);
};

const saveStartedApps = (resource) => {
  if (resource.entity.state === 'STARTED')
    cache.apps.push(resource.metadata.guid);
};

const allAppsUri = (nextPageUri) => {
  return nextPageUri ? ':api' + nextPageUri :
    ':api/v2/apps?order-direction=asc&results-per-page=50';
};

const readNextAppsPage = (nextUrl, cb) => {
  readResourceList(
    foreachPage(forEachResource(saveStartedApps), readNextAppsPage, cb),
    () => allAppsUri(nextUrl), null, cb);
};

const readAllApps = (cb = () => {}) => {
  readResourceList(
    foreachPage(forEachResource(saveStartedApps), readNextAppsPage, cb),
    allAppsUri, null, (error, response) => {
      if (error || response.statusCode !== 200)
        module.appsReader = setTimeout(readAllApps, 1000);

      cache.apps = uniq(cache.apps);
      cb(error, response);
    }
  );
};

const appUsageUriCompensation = (nextPageUri) => {
  let uri = nextPageUri ? ':api' + nextPageUri :
    ':api/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastCompensatedGUID)
    uri += '&after_guid=' + cache.lastCompensatedGUID;

  return uri;
};

const purgeCompensation = (cb = () => {}) => {

  const checkWithCC = (resource, cb) => {
    let guid = resource.entity.app_guid;
    if (resource.entity.state === 'STARTED')
      if (cache.apps.indexOf(guid) < 0) {

        debug('Submitting STOP usage for app %s', guid);
        const usage = getAppUsage(resource, true);
        reportUsage(usage, (error, response) => {
          if (error || response.statusCode !== 201) {
            debug('Compensation will retry from %s',
              cache.lastCompensatedGUID);
            setTimeout(purgeCompensation, 1000);
            cb(error);
            return;
          }

          cache.lastCompensatedGUID = guid;
          cb(null);
        });
      }
  };

  const readNextPageAndCompensate = (nextUrl, cb) => {
    readResourceList(
      foreachPage(forEachResource(checkWithCC), readNextUsagePage, cb),
      () => appUsageUriCompensation(nextUrl), null, cb);
  };

  readResourceList(
    foreachPage(forEachResource(checkWithCC), readNextPageAndCompensate, cb),
    appUsageUriCompensation, null, cb);
};

const scheduleUsageReporting = () => {
  debug('First attempt ro obtain token due in 200ms');
  module.tokenRefresher = setTimeout(obtainToken, 200,
    (err, token) => debug('Callback: %j %s', err, token));

  // Start purge compensation after we are sure we have stable event order
  module.appsReader = setTimeout(readAllApps, 0);
  module.purgeCompensation = setTimeout(purgeCompensation, guidMaxAge);

  module.usageEventPoller = setInterval(readUsage, 5000);
  module.usageReporter = setInterval(reportAppsUsage, reportingInterval);

  // Cancel scheduled timers
  process.on('exit', stopReporting);
};

// Create a bridge app
const bridge = () => {
  debug('Starting bridge app ...');
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
module.exports.cache = cache;
module.exports.readUsage = readUsage;
module.exports.reportAppUsage = reportAppsUsage;
module.exports.stopReporting = stopReporting;
module.exports.readAllApps = readAllApps;
module.exports.purgeCompensation = purgeCompensation;
module.exports.runCLI = runCLI;

