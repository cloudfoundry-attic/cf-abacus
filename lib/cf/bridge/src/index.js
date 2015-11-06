'use strict';

const router = require('abacus-router');
const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const webapp = require('abacus-webapp');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const cluster = require('abacus-cluster');
const oauth = require('./oauth.js');
const paging = require('./paging.js');
const util = require('util');

const brequest = batch(request);

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = urienv({
  api      : 80,
  uaa      : 443,
  collector: 9080
});

const cache = {
  apps               : [],
  lastRecordedGUID   : null,
  lastCompensatedGUID: null
};

const minIntervalTime = 1000;
const maxIntervalTime = 240000;
const guidMaxAge = 60000;

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

const reportUsage = (usage, config, cb = () => {}) => {
  throttle(brequest.post(':collector/v1/metering/collected/usage', {
    collector: uris.collector,
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
  }));
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

  // Update stored guid only if old enough
  if (age > guidMaxAge) {
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

const reportAppsUsage = (onError = () => {}) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastRecordedGUID)
    uri += '&after_guid=' + cache.lastRecordedGUID;

  paging.readPage(uri, {
    processResourceFn: (resource, done) => {
      const usage = buildAppUsage(resource);
      debug('Reporting usage event %j', usage);
      reportUsage(usage, reportingConfig, (error, response) => {
        if (error || !response || response.statusCode !== 201) {
          setReportingInterval(reportAppsUsage,
            increaseRetryInterval(reportingConfig));
          onError(error, response);
          return;
        }

        storeElderGuid(resource);
        reportingStats.reported++;
        resetReportingInterval(reportAppsUsage, reportingConfig);
        done();
      });
    },
    onError: onError
  });
};

const saveStartedApps = (resource, done) => {
  const appGuid = resource.metadata.guid;
  if (resource.entity.state === 'STARTED' && cache.apps.indexOf(appGuid) < 0)
    cache.apps.push(resource.metadata.guid);

  done();
};

const fetchCFApps = (onError = () => {}) => {
  let uri = '/v2/apps?order-direction=asc&results-per-page=50';

  paging.readPage(uri, {
    processResourceFn: saveStartedApps,
    onError: (error, response) => {
      // retry
      if (error || !response || response.statusCode !== 200)
        module.appsReader = setTimeout(fetchCFApps, 1000);

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

const purgeCompensation = (onError = () => {}) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastCompensatedGUID)
    uri += '&after_guid=' + cache.lastCompensatedGUID;

  paging.readPage(uri, {
    processResourceFn: (resource, done) => {
      let guid = resource.entity.app_guid;

      if (resource.entity.state === 'STARTED') {
        if (cache.apps.indexOf(guid) < 0) {
          const usage = buildAppUsage(resource, true);
          debug('Submitting STOP usage for app %s', guid);
          reportUsage(usage, compensationConfig, (error, response) => {
            let responseCode = 'none';
            if (response)
              responseCode = response.statusCode;

            if (error || responseCode !== 201) {
              schedulePurgeCompensation(purgeCompensation,
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

const stopReporting = () => {
  debug('Cancelling timers');
  oauth.stop();
  clearTimeout(module.appsReader);
  clearTimeout(module.purgeCompensation);
  clearInterval(module.usageReporter);
};

const scheduleUsageReporting = () => {
  oauth.start('bridge', 'secret');

  // Start purge compensation after we are sure we have stable event order
  module.appsReader = setTimeout(fetchCFApps, 0);
  module.purgeCompensation = setTimeout(purgeCompensation,
    guidMaxAge);

  module.usageReporter = setInterval(reportAppsUsage,
    reportingConfig.minInterval);

  // Cancel scheduled timers
  process.on('exit', stopReporting);
};

// Create a CF bridge app
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
module.exports.cache = cache;
module.exports.reportAppUsage = reportAppsUsage;
module.exports.stopReporting = stopReporting;
module.exports.fetchCFApps = fetchCFApps;
module.exports.purgeCompensation = purgeCompensation;
module.exports.reportingConfig = reportingConfig;
module.exports.compensationConfig = compensationConfig;
module.exports.runCLI = runCLI;

