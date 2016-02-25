'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;
const omit = _.omit;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const oauth = require('abacus-oauth');
const partition = require('abacus-partition');
const request = require('abacus-request');
const retry = require('abacus-retry');
const router = require('abacus-router');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const paging = require('./paging.js');

const brequest = throttle(batch(request));

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = memoize(() => urienv({
  api      : 80,
  collector: 9080,
  db       : 5984
}));

// Use secure routes or not
const secured = process.env.SECURED === 'true';

// Token for reporting usage
const linuxContainerToken = secured ? oauth.cache(uris().api,
  process.env.CLIENT_ID, process.env.CLIENT_SECRET,
  'abacus.usage.linux-container.write abacus.usage.linux-container.read') :
  undefined;

// Token for app usage events
const cfAdminToken = oauth.cache(uris().api,
  process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);

// DB for storing the last processed app and app-usage GUIDs
const db = throttle(retry(breaker(batch(
  dbclient(partition.singleton, dbclient.dburi(uris().db, 'abacus-cf-bridge'))
))));

const minIntervalTime = 1000;
const maxIntervalTime = 240000;
const guidMinAge = 60000;

const reportingConfig = {
  minInterval    : minIntervalTime,
  maxInterval    : maxIntervalTime,
  maxRetries     : Math.floor(Math.log(maxIntervalTime)),
  currentRetries : 0
};
const compensationConfig = {
  minInterval    : minIntervalTime,
  maxInterval    : maxIntervalTime,
  maxRetries     : Math.floor(Math.log(maxIntervalTime)),
  currentRetries : 0
};

const reportingStats = {
  reported: 0
};
const compensationStats = {
  reported: 0
};

// In-memory cache for apps state, last processed app and app-usage event GUIDs
const cache = {
  apps: [],
  lastRecordedGUID: null,
  lastCompensatedGUID: null
};

const cacheId = 'abacus-cf-bridge-cache';

const readDBCache = (cb) => {
  debug('Reading DB cache...');
  db.get(cacheId, (error, dbCache) => {
    if (error)
      throw error;

    if (dbCache) {
      cache.lastCompensatedGUID = dbCache.lastCompensatedGUID;
      cache.lastRecordedGUID = dbCache.lastRecordedGUID;
      // Mutate cache intentionally to store the CouchDB revision
      cache._rev = dbCache._rev;
    }

    debug('Read DB cache: %o', dbCache);
    cb(dbCache);
  });
};

let stoppedFlag = false;
let storedCompensationGUID = null;
let storedRecordedGUID = null;

const storeDBCache = () => {
  // Do not execute if we are about to stop
  if (stoppedFlag)
    return;

  const currentCache = omit(cache, 'apps');
  if (storedCompensationGUID === currentCache.lastCompensatedGUID &&
    storedRecordedGUID === currentCache.lastRecordedGUID) {
    debug('No cache change. Skipping update');

    // Schedule new execution
    module.cacheStorage = setTimeout(storeDBCache,
      reportingConfig.minInterval * 2);
    return;
  }

  const newCache = extend({ id: cacheId }, currentCache);
  debug('Storing cache %o in DB', newCache);
  db.bulkDocs([newCache], {}, (error, docs) => {
    if (error)
      throw error;
    if (docs && docs[0].error)
      throw new Error(docs[0].message);

    debug('Stored GUIDs: %o', docs[0]);
    storedCompensationGUID = newCache.lastCompensatedGUID;
    storedRecordedGUID = newCache.lastRecordedGUID;

    // Mutate cache intentionally to store the CouchDB revision
    cache._rev = docs[0].rev;

    // Schedule new execution
    module.cacheStorage = setTimeout(storeDBCache,
      reportingConfig.minInterval * 2);
  });
};

routes.get('/v1/cf/bridge', throttle(function *(req) {
  return {
    body: {
      reporting: {
        config: reportingConfig,
        statistics: reportingStats
      },
      purgeCompensation: {
        config: compensationConfig,
        statistics: compensationStats
      }
    }
  };
}));

const authHeader = (token) => token ? { authorization: token() } : {};

const reportUsage = (usage, token, config, cb = () => {}) => {
  brequest.post(':collector/v1/metering/collected/usage', {
    collector: uris().collector,
    headers: authHeader(token),
    body: usage.usage
  }, (error, response) => {
    if (!error && response && response.statusCode === 201) {
      debug('Successfully reported usage %j with headers %j',
        usage, response.headers);
      cb(error, response);
      return;
    }
    debug('Failed reporting\n\tusage %j\n\terror %j\n\tresponse %j',
      usage, error, response);
    cb(error, response);
  });
};

const buildAppUsage = (event, stopped = false) => {
  const memBytes = event.entity.memory_in_mb_per_instance * 1048576;
  const eventTime = Date.parse(event.metadata.created_at);
  const stopEvent = stopped || event.entity.state === 'STOPPED';

  return {
    usage: {
      usage: [{
        start: eventTime,
        end: eventTime,
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

  // Allow guid to be stored only if old enough
  if (age > guidMinAge) {
    cache.lastRecordedGUID = resource.metadata.guid;
    debug('Last processed guid set to %s with time-stamp %s',
      cache.lastRecordedGUID, resourceDate.toISOString());
  }
};

const getRetryInterval = (config) => {
  return config.minInterval + Math.floor(Math.expm1(config.currentRetries));
};

const increaseRetryInterval = (config) => {
  let interval = config.maxInterval;
  if (config.currentRetries < config.maxRetries)
    interval = getRetryInterval(config);

  config.currentRetries++;
  return interval;
};

const setReportingInterval = (fn , interval) => {
  clearInterval(module.usageReporter);
  module.usageReporter = setInterval(fn, interval);
  debug('Reporting interval set to %d ms', interval);
};

const resetReportingInterval = (fn, config) => {
  if (config.currentRetries === 0)
    return;

  config.currentRetries = 0;
  setReportingInterval(fn, config.minInterval);
};

const reportAppsUsage = (cfToken, abacusToken, onError = () => {}) => {
  if (secured && !abacusToken) {
    debug('Missing resource provider token');
    onError('Missing resource provider token', null);
    return;
  }

  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastRecordedGUID)
    uri += '&after_guid=' + cache.lastRecordedGUID;

  paging.readPage(uri, cfToken, {
    processResourceFn: (resource, done) => {
      const usage = buildAppUsage(resource);
      debug('Reporting usage event %j', usage);
      reportUsage(usage, abacusToken, reportingConfig, (error, response) => {
        if (error || !response || response.statusCode !== 201) {
          setReportingInterval(() =>
            reportAppsUsage(cfToken, abacusToken, onError),
            increaseRetryInterval(reportingConfig));
          onError(error, response);
          return;
        }

        storeElderGuid(resource);
        reportingStats.reported++;
        resetReportingInterval(() =>
          reportAppsUsage(cfToken, abacusToken, onError), reportingConfig);
        done();
      });
    },
    onError: (error, response) => {
      if (response && response.statusCode === 400 &&
        response.body && response.body.code == 10005) {
        debug('CC cannot find GUID %s. Restarting reporting',
          cache.lastRecordedGUID);
        cache.lastRecordedGUID = undefined;
      }
      onError(error, response);
    }
  });
};

const saveStartedApps = (resource, done) => {
  const appGuid = resource.metadata.guid;
  if (resource.entity.state === 'STARTED' && cache.apps.indexOf(appGuid) < 0)
    cache.apps.push(resource.metadata.guid);

  done();
};

const fetchCFApps = (token, onError = () => {}) => {
  let uri = '/v2/apps?order-direction=asc&results-per-page=50';

  paging.readPage(uri, token, {
    processResourceFn: saveStartedApps,
    onError: (error, response) => {
      // retry
      if (error || !response || response.statusCode !== 200)
        module.appsReader = setTimeout(() => fetchCFApps(token), 1000);

      onError(error, response);
    }
  });
};

const reportError = (guid, error, response, done, onError) => {
  const processingError = util.format('Reporting usage for ' +
    'app %s failed with error %s, response %j',
    guid, error, response);
  debug(processingError);

  done(processingError);
  onError(error, response);
};

const schedulePurgeCompensation = (fn, timeout) => {
  const lastGUID = cache.lastCompensatedGUID;
  debug('Compensation will retry from %s in %s ms',
    lastGUID ? lastGUID : 'the start', timeout);
  module.purgeCompensation = setTimeout(fn, timeout);
};

const purgeCompensation = (cfToken, abacusToken, onError = () => {}) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastCompensatedGUID)
    uri += '&after_guid=' + cache.lastCompensatedGUID;

  paging.readPage(uri, cfToken, {
    processResourceFn: (resource, done) => {
      let guid = resource.entity.app_guid;

      if (resource.entity.state === 'STARTED') {
        if (cache.apps.indexOf(guid) < 0) {
          const usage = buildAppUsage(resource, true);
          debug('Submitting STOP usage for app %s', guid);
          reportUsage(usage, abacusToken, compensationConfig,
            (error, response) => {
              let responseCode = 'none';
              if (response)
                responseCode = response.statusCode;

              if (error || responseCode !== 201) {
                schedulePurgeCompensation(() =>
                  purgeCompensation(cfToken, abacusToken, onError),
                  increaseRetryInterval(compensationConfig));
                reportError(guid, error, response, done, onError);
                return;
              }

              cache.lastCompensatedGUID = guid;
              compensationConfig.currentRetries = 0;
              compensationStats.reported++;
              done();
            });
        }
      }
      else {
        cache.lastCompensatedGUID = guid;
        done();
      }
    },
    onError: onError
  });
};

const stopReporting = (cb = () => {}) => {
  stoppedFlag = true;

  debug('Cancelling timers');
  clearTimeout(module.appsReader);
  clearTimeout(module.purgeCompensation);
  clearInterval(module.usageReporter);
  clearInterval(module.cacheStorage);

  if (typeof cb === 'function')
    cb();
};

const scheduleUsageReporting = () => {
  // Start token functions
  cfAdminToken.start();
  if (secured)
    linuxContainerToken.start();

  // Start purge compensation after we are sure we have stable event order
  module.appsReader = setTimeout(() => fetchCFApps(cfAdminToken), 0);
  module.purgeCompensation = setTimeout(() =>
      purgeCompensation(cfAdminToken, linuxContainerToken),
    guidMinAge);

  module.usageReporter = setInterval(() =>
      reportAppsUsage(cfAdminToken, linuxContainerToken),
    reportingConfig.minInterval);

  // Cancel scheduled timers
  process.on('exit', stopReporting);
};

// Initialize cache from DB
const initCache = (cb) => {
  readDBCache(() => {
    // Start write timer
    if (!module.cacheStorage)
      module.cacheStorage = setTimeout(storeDBCache,
        reportingConfig.minInterval * 2);

    cb();
  });
};

// Create a CF bridge app
const bridge = () => {
  debug('Starting bridge app ...');
  cluster.singleton();

  if (cluster.isWorker()) {
    debug('Starting bridge worker');
    initCache(() => {
      scheduleUsageReporting();
    });
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
module.exports.cache = cache;
module.exports.initCache = initCache;
module.exports.reportAppUsage = reportAppsUsage;
module.exports.stopReporting = stopReporting;
module.exports.fetchCFApps = fetchCFApps;
module.exports.purgeCompensation = purgeCompensation;
module.exports.reportingConfig = reportingConfig;
module.exports.compensationConfig = compensationConfig;
module.exports.runCLI = runCLI;

