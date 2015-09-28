'use strict';

const router = require('abacus-router');
const throttle = require('abacus-throttle');
const webapp = require('abacus-webapp');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const cluster = require('abacus-cluster');
const oauth = require('./oauth.js');
const paging = require('./paging.js');
const util = require('util');

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

const reportUsage = (usage, cb = () => {}) => {
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

const reportAppsUsage = (onError = () => {}) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastRecordedGUID)
    uri += '&after_guid=' + cache.lastRecordedGUID;

  paging.readPage(uri, {
    processResourceFn: (resource, done) => {
      debug('Reporting usage event %j', resource);
      reportUsage(getAppUsage(resource), (error, response) => {
        if (error || response.statusCode !== 201) {
          done('Failed to report usage');
          onError(error, response);
          return;
        }

        storeElderGuid(resource);
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
      if (error || response.statusCode !== 200)
        module.appsReader = setTimeout(fetchCFApps, 1000);

      onError(error, response);
    }
  });
};

const purgeCompensation = (onError = () => {}) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastCompensatedGUID)
    uri += '&after_guid=' + cache.lastCompensatedGUID;

  paging.readPage(uri, {
    processResourceFn: (resource, done) => {
      let guid = resource.entity.app_guid;
      let processingError;

      if (resource.entity.state === 'STARTED')
        if (cache.apps.indexOf(guid) < 0) {
          debug('Submitting STOP usage for app %s', guid);
          const usage = getAppUsage(resource, true);
          reportUsage(usage, (error, response) => {
            if (error || response.statusCode !== 201) {
              debug('Compensation will retry from %s',
                cache.lastCompensatedGUID);
              module.purgeCompensation = setTimeout(purgeCompensation, 1000);

              processingError = util.format('Reporting usage for app %s ' +
                'failed with error %s, response code %s',
                guid, error, response ? response.statusCode : 'none');
              debug(processingError);
              onError(error, response);
            }
          });
        }

      cache.lastCompensatedGUID = guid;
      done(processingError);
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
  module.purgeCompensation = setTimeout(purgeCompensation, guidMaxAge);

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
module.exports.cache = cache;
module.exports.reportAppUsage = reportAppsUsage;
module.exports.stopReporting = stopReporting;
module.exports.fetchCFApps = fetchCFApps;
module.exports.purgeCompensation = purgeCompensation;
module.exports.runCLI = runCLI;
