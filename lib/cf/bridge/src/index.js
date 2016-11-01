'use strict';

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;
const omit = _.omit;
const findWhere = _.findWhere;

const util = require('util');

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const moment = require('moment');
const oauth = require('abacus-oauth');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const request = require('abacus-request');
const retry = require('abacus-retry');
const router = require('abacus-router');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const paging = require('abacus-paging');

const brequest = throttle(batch(request));

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-bridge');
const edebug = require('abacus-debug')('e-abacus-cf-bridge');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = memoize(() => urienv({
  api        : 80,
  auth_server: 9882,
  collector  : 9080,
  db         : 5984
}));

// Use secure routes or not
const secured = process.env.SECURED === 'true';

// Token for reporting usage
const linuxContainerToken = secured ? oauth.cache(uris().auth_server,
  process.env.CLIENT_ID, process.env.CLIENT_SECRET,
  'abacus.usage.linux-container.write abacus.usage.linux-container.read') :
  undefined;

// Token for app usage events
const cfAdminToken = oauth.cache(uris().auth_server,
  process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);

// DB for storing the last processed app and app-usage GUIDs
const db = throttle(retry(breaker(batch(
  dbclient(partition.singleton, dbclient.dburi(uris().db, 'abacus-cf-bridge'))
))));

// Carry-over DB user to transfer usage to the next month
const carryOverDB = throttle(retry(breaker(batch(
  dbclient(partition.partition, dbclient.dburi(uris().db, 'abacus-carry-over'))
))));

const minIntervalTime = parseInt(process.env.MIN_INTERVAL_TIME) || 5000;
const maxIntervalTime = parseInt(process.env.MAX_INTERVAL_TIME) || 240000;
const guidMinAge = parseInt(process.env.GUID_MIN_AGE) || 60000;

const reportingConfig = {
  minInterval    : minIntervalTime,
  maxInterval    : maxIntervalTime,
  guidMinAge     : guidMinAge,
  maxRetries     : Math.floor(Math.log(maxIntervalTime)),
  currentRetries : 0
};
const compensationConfig = {
  minInterval    : minIntervalTime,
  maxInterval    : maxIntervalTime,
  maxRetries     : Math.floor(Math.log(maxIntervalTime)),
  currentRetries : 0,
  inProgress     : false
};

// In-memory cache for apps state, last processed app and app-usage event GUIDs
const cache = {
  apps: [],
  lastRecordedGUID: undefined,
  lastRecordedTimestamp: undefined,
  lastCompensatedGUID: undefined,
  lastCompensatedTimestamp: undefined
};

// Function call statistics
const statistics = {
  cache: {
    read: 0,
    write: 0
  },
  compensation: {
    saveCalls: 0,
    started: 0,
    fetchSuccess: 0,
    fetchFailure: 0,
    usageSuccess: 0,
    usageFailure: 0,
    usageConflict: 0,
    usageSkip: 0
  },
  usage: {
    missingToken: 0,
    reportFailures: 0,
    reportSuccess: 0,
    reportConflict: 0,
    loopFailures: 0,
    loopSuccess: 0,
    loopConflict: 0,
    loopSkip : 0
  },
  carryOver: {
    removeSuccess: 0,
    removeFailure: 0,
    upsertSuccess: 0,
    upsertFailure: 0
  },
  paging: {
    missingToken: 0,
    pageReadSuccess: 0,
    pageReadFailures: 0,
    pageProcessSuccess: 0,
    pageProcessFailures: 0,
    pageProcessEnd: 0
  }
};

const cacheId = 'abacus-cf-bridge-cache';

const readDBCache = (cb) => {
  debug('Reading DB cache...');
  const t0 = Date.now();
  db.get(cacheId, (error, dbCache) => {
    if (error)
      throw error;

    if (dbCache) {
      cache.lastCompensatedGUID = dbCache.lastCompensatedGUID;
      cache.lastCompensatedTimestamp = dbCache.lastCompensatedTimestamp;
      cache.lastRecordedGUID = dbCache.lastRecordedGUID;
      cache.lastRecordedTimestamp = dbCache.lastRecordedTimestamp;
      // Mutate cache intentionally to store the CouchDB revision
      cache._rev = dbCache._rev;
    }

    debug('Read DB cache: %o', dbCache);
    statistics.cache.read++;
    perf.report('cache.read', t0);
    cb(dbCache);
  });
};

let storedCompensationGUID = undefined;
let storedRecordedGUID = undefined;

const writeDBCache = () => {
  if (storedCompensationGUID === cache.lastCompensatedGUID &&
    storedRecordedGUID === cache.lastRecordedGUID) {
    debug('No change in processed GUIDs. Skipping cache update');

    // Schedule new execution
    module.cacheStorage = setTimeout(writeDBCache,
      reportingConfig.minInterval * 5);
    return;
  }

  debug('Cached GUIDs change detected. Storing in DB ...');
  const t0 = Date.now();
  const newCache = extend({ id: cacheId }, omit(cache, 'apps'));
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

    // Report performance data
    statistics.cache.write++;
    perf.report('cache.write', t0);

    // Schedule new execution
    module.cacheStorage = setTimeout(writeDBCache,
      reportingConfig.minInterval * 2);
  });
};

const authHeader = (token) => token ? { authorization: token() } : {};

const buildKey = (usage) => dbclient.kturi(
    util.format('%s/%s/%s/%s/%s/%s',
      usage.organization_id, usage.space_id, usage.consumer_id,
      usage.resource_id, usage.plan_id, usage.resource_instance_id),
    moment(usage.start).utc().startOf('month').valueOf());

const extractCollectorId = (location) =>
  location.replace(uris().collector + '/v1/metering/collected/usage/', '');

const stoppedAppCriteria = { measure: 'current_instance_memory', quantity: 0 };

const storeCarryOverUsage = (usage, response, cb) => {
  const t0 = Date.now();

  const key = buildKey(usage);
  const collectorId = extractCollectorId(response.headers.location);

  carryOverDB.get(key, (error, doc) => {
    if (error) {
      edebug('Error getting carry-over usage:', error);
      statistics.carryOver.upsertFailure++;
      perf.report('carryOver', t0, undefined, new Error(error));
      cb(error, response);
      return;
    }

    const updatedDoc = extend({ _id: key }, doc, { collector_id: collectorId });

    if (findWhere(usage.measured_usage, stoppedAppCriteria)) {
      debug('Removing carry-over usage for %s ...', key);
      carryOverDB.remove(updatedDoc, (error) => {

        // Handle 404 by CouchDB on missing document
        const opError = error ?
          error.status != 404 ? error : undefined
          : undefined;

        if (opError) {
          edebug('Error removing carry-over usage:', opError);
          statistics.carryOver.removeFailure++;
          perf.report('carryOver', t0, undefined, new Error(opError));
        }
        else {
          statistics.carryOver.removeSuccess++;
          perf.report('carryOver', t0);
        }

        cb(opError, response);
      });
      return;
    }

    debug('Adding carry-over usage for %s ...', key);
    carryOverDB.put(updatedDoc, (error) => {
      if (error) {
        edebug('Error updating carry-over usage:', error);
        statistics.carryOver.upsertFailure++;
        perf.report('carryOver', t0, undefined, new Error(error));
      }
      else {
        statistics.carryOver.upsertSuccess++;
        perf.report('carryOver', t0);
      }

      cb(error, response);
    });
  });
};

const reportUsage = (usage, token, config, cb = () => {}) => {
  const t0 = Date.now();
  brequest.post(':collector/v1/metering/collected/usage', {
    collector: uris().collector,
    headers: authHeader(token),
    body: usage
  }, (error, response) => {
    if (!error && response) {
      if (response.statusCode === 201) {
        if (!response.headers || !response.headers.location) {
          const message = util.format('No Location header found in ' +
            'response %j for usage %j', response, usage);
          edebug(message);
          throw new Error(message);
        }

        debug('Successfully reported usage %j with headers %j',
          usage, response.headers);
        statistics.usage.reportSuccess++;
        perf.report('report', t0);

        storeCarryOverUsage(usage, response, cb);
        return;
      }
      if (response.statusCode === 409) {
        debug('Conflicting usage %j. Response: %j', usage, response);
        statistics.usage.reportConflict++;
        perf.report('report', t0, undefined, undefined, undefined, 'rejected');
      }
      cb(error, response);
      return;
    }
    const message = util.format('Failed reporting\n\tusage %j\n\terror %j' +
      '\n\tresponse %j', usage, error, response);
    edebug(message);
    statistics.usage.reportFailures++;
    perf.report('report', t0, undefined, new Error(error));
    cb(error, response);
  });
};

const modifyStartEventUsage = (usage, previousState) => {
  // First/initial start
  if (previousState === 'STOPPED') {
    debug('Initial start event detected. ' +
      'Setting previous memory and instances to 0');
    usage.previousInstanceMemory = 0;
    usage.previousRunningInstances = 0;
    return;
  }
  // Purged start event
  if (usage.currentRunningInstances == usage.previousRunningInstances &&
    usage.currentInstanceMemory == usage.previousInstanceMemory) {
    debug('Purged start event detected. ' +
      'Setting previous memory and instances to 0');
    usage.previousInstanceMemory = 0;
    usage.previousRunningInstances = 0;
  }
};

const modifyStopEventUsage = (usage) => {
  debug('Stop event detected. Setting current memory and instances to 0');
  usage.currentInstanceMemory = 0;
  usage.currentRunningInstances = 0;
};

const buildAppUsage = (event, stopped = false) => {
  const usage = {
    currentRunningInstances: event.entity.instance_count,
    previousRunningInstances: event.entity.previous_instance_count,
    currentInstanceMemory:
      event.entity.memory_in_mb_per_instance * 1048576,
    previousInstanceMemory:
      event.entity.previous_memory_in_mb_per_instance * 1048576
  };

  const eventState = event.entity.state;
  const previousEventState = event.entity.previous_state;
  switch (eventState) {
    case'BUILDPACK_SET':
      debug('Skipping BUILDPACK_SET event');
      return undefined;
    case 'STARTED':
      modifyStartEventUsage(usage, previousEventState);
      break;
    case 'STOPPED':
      modifyStopEventUsage(usage);
      break;
  }

  if (stopped) {
    debug('Stop usage requested. Setting current memory and instances to 0');
    usage.currentInstanceMemory = 0;
    usage.currentRunningInstances = 0;
  }

  const eventTime = Date.parse(event.metadata.created_at);
  return {
    start: eventTime,
    end: eventTime,
    organization_id: event.entity.org_guid,
    space_id: event.entity.space_guid,
    consumer_id: 'app:' + event.entity.app_guid,
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:' + event.entity.app_guid,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: usage.currentInstanceMemory
      },
      {
        measure: 'current_running_instances',
        quantity: usage.currentRunningInstances
      },
      {
        measure: 'previous_instance_memory',
        quantity: usage.previousInstanceMemory
      },
      {
        measure: 'previous_running_instances',
        quantity: usage.previousRunningInstances
      }
    ]
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
const isElder = (resource) => {
  const now = new Date().getTime();
  const resourceDate = new Date(resource.metadata.created_at);
  const age = now - resourceDate.getTime();
  const elder = age > guidMinAge;
  debug('Resource %s has age %d. Minimum resource age is %d. Elder: %s',
    resource.metadata.guid, age, guidMinAge, elder);

  return elder;
};

/**
 * Remember the resource GUID. We will poll events from CC starting with the
 * last stored GUID.
 */
const storeGuid = (resource) => {
  const resourceDate = new Date(resource.metadata.created_at);
  cache.lastRecordedGUID = resource.metadata.guid;
  cache.lastRecordedTimestamp = resource.metadata.created_at;
  debug('Last processed guid set to %s with time-stamp %s',
    cache.lastRecordedGUID, resourceDate.toISOString());
};

const getRetryTimeout = (config) => {
  return config.minInterval + Math.floor(Math.expm1(config.currentRetries));
};

const increaseRetryTimeout = (config) => {
  let interval = config.maxInterval;
  if (config.currentRetries < config.maxRetries)
    interval = getRetryTimeout(config);

  config.currentRetries++;
  return interval;
};

const setReportingTimeout = (fn , interval) => {
  clearTimeout(module.usageReporter);
  module.usageReporter = setTimeout(fn, interval);
  debug('Reporting interval set to %d ms', interval);
};

const resetReportingTimeout = (fn, config) => {
  config.currentRetries = 0;
  setReportingTimeout(fn, config.minInterval);
};

const reportAppUsage = (cfToken, abacusToken, { failure, success }) => {
  if (secured && !abacusToken()) {
    edebug('Missing resource provider token');
    setReportingTimeout(() =>
      reportAppUsage(cfToken, abacusToken, {
        failure: failure,
        success: success
      }), increaseRetryTimeout(reportingConfig));
    statistics.usage.missingToken++;
    failure('Missing resource provider token', null);
    return;
  }

  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastRecordedGUID)
    uri += '&after_guid=' + cache.lastRecordedGUID;

  paging.readPage(uri, cfToken, perf, statistics, {
    processResourceFn: (resource, done) => {
      const t0 = Date.now();
      const usage = buildAppUsage(resource);

      if (usage && isElder(resource)) {
        debug('Reporting usage event %j', usage);
        reportUsage(usage, abacusToken, reportingConfig, (error, response) => {
          if (!error && response && response.statusCode === 409) {
            statistics.usage.loopConflict++;
            perf.report('usage', t0, undefined, undefined,
              undefined, 'rejected');
            done();
            return;
          }
          if (error || !response || response.statusCode !== 201) {
            statistics.usage.loopFailures++;
            perf.report('usage', t0, undefined,
              new Error('Error reporting usage'));
            done(error, response);
            return;
          }

          storeGuid(resource);
          resetReportingTimeout(() => reportAppUsage(cfToken, abacusToken, {
            failure: failure,
            success: success
          }), reportingConfig);
          statistics.usage.loopSuccess++;
          perf.report('usage', t0);
          done();
        });
      }
      else {
        debug('Skipping report for non-elder usage event %j', usage);
        statistics.usage.loopSkip++;
        perf.report('usage', t0, undefined, undefined,
          undefined, 'rejected');
        done();
      }
    },
    failure: (error, response) => {
      if (response && response.statusCode === 400 &&
        response.body && response.body.code == 10005) {
        edebug('CC cannot find GUID %s. Restarting reporting',
          cache.lastRecordedGUID);
        cache.lastRecordedGUID = undefined;
        cache.lastRecordedTimestamp = undefined;
      }

      setReportingTimeout(() => reportAppUsage(cfToken, abacusToken, {
        failure: failure,
        success: success
      }), increaseRetryTimeout(reportingConfig));
      failure(error, response);
    },
    success: () => {
      debug('Reporting app usage finished successfully');
      resetReportingTimeout(() => reportAppUsage(cfToken, abacusToken, {
        failure: failure,
        success: success
      }), reportingConfig);
      success();
    }
  });
};

const saveStartedApps = (resource, done) => {
  const t0 = Date.now();
  const appGuid = resource.metadata.guid;
  if (resource.entity.state === 'STARTED' && cache.apps.indexOf(appGuid) < 0) {
    cache.apps.push(resource.metadata.guid);
    statistics.compensation.started++;
  }

  statistics.compensation.saveCalls++;
  perf.report('save', t0);
  done();
};

const fetchCFApps = (cfToken, { failure, success }) => {
  const t0 = Date.now();
  const uri = '/v2/apps?order-direction=asc&results-per-page=50';
  paging.readPage(uri, cfToken, perf, statistics, {
    processResourceFn: saveStartedApps,
    failure: (error, response) => {
      module.appsReader = setTimeout(() =>
        fetchCFApps(cfToken, { failure, success }), 1000);
      statistics.compensation.fetchFailure++;
      perf.report('fetch', t0, undefined,
        new Error(util.format('Failed to fetch CF apps due to error %j ' +
        'and response %j', error, response)));

      failure(error, response);
    },
    success: () => {
      statistics.compensation.fetchSuccess++;
      perf.report('fetch', t0);

      success();
    }
  });
};

const schedulePurgeCompensation = (fn, timeout) => {
  const lastGUID = cache.lastCompensatedGUID;
  debug('Compensation will retry from %s in %s ms',
    lastGUID ? lastGUID : 'the start', timeout);
  module.purgeCompensation = setTimeout(fn, timeout);
};

const purgeCompensation = (cfToken, abacusToken, { failure, success }) => {
  let uri = '/v2/app_usage_events?order-direction=asc&results-per-page=50';
  if (cache.lastCompensatedGUID)
    uri += '&after_guid=' + cache.lastCompensatedGUID;

  paging.readPage(uri, cfToken, perf, statistics, {
    processResourceFn: (resource, done) => {
      const t0 = Date.now();
      let guid = resource.entity.app_guid;

      if (resource.entity.state === 'STARTED') {
        if (cache.apps.indexOf(guid) < 0) {
          const usage = buildAppUsage(resource, true);
          if (usage) {
            debug('Submitting STOP usage for app %s', guid);
            reportUsage(usage, abacusToken, compensationConfig,
              (error, response) => {
                const responseCode = response ? response.statusCode : 'none';

                if (!error && response && response.statusCode === 409) {
                  statistics.compensation.usageConflict++;
                  perf.report('compensation', t0, undefined, undefined,
                    undefined, 'rejected');
                  done();
                  return;
                }
                if (error || responseCode !== 201) {
                  statistics.compensation.usageFailure++;
                  perf.report('compensation', t0, undefined,
                    new Error('Error reporting compensating usage'));
                  done(error, response);
                  return;
                }

                cache.lastCompensatedGUID = guid;
                cache.lastCompensatedTimestamp = resource.metadata.created_at;
                compensationConfig.currentRetries = 0;
                statistics.compensation.usageSuccess++;
                perf.report('compensation', t0);
                done();
              });
          }
          else {
            statistics.compensation.usageSkip++;
            perf.report('compensation', t0,
              undefined, undefined, undefined, true);
            done();
          }
        }
      }
      else {
        cache.lastCompensatedGUID = guid;
        cache.lastCompensatedTimestamp = resource.metadata.created_at;
        statistics.compensation.usageSkip++;
        perf.report('compensation', t0, undefined, undefined, undefined, true);
        done();
      }
    },
    failure: (error, response) => {
      schedulePurgeCompensation(() =>
        purgeCompensation(cfToken, abacusToken, { failure, success }),
        increaseRetryTimeout(compensationConfig));
      failure(error, response);
    },
    success: () => {
      debug('Compensating app usage finished successfully');
      success();
    }
  });
};

const stopReporting = (cb = () => {}) => {
  edebug('Cancelling timers');
  clearTimeout(module.appsReader);
  clearTimeout(module.purgeCompensation);
  clearTimeout(module.usageReporter);
  clearTimeout(module.cacheStorage);

  if (typeof cb === 'function')
    cb();
};

const scheduleUsageReporting = () => {
  // Start token functions
  cfAdminToken.start();
  if (secured)
    linuxContainerToken.start();

  module.usageReporter = setTimeout(() => {
    debug('Starting usage reporting ...');
    reportAppUsage(cfAdminToken, linuxContainerToken, {
      failure: (error, response) => {},
      success: () => {}
    });
  }, reportingConfig.minInterval);

  // Cancel scheduled timers
  process.on('exit', stopReporting);
};

// Initialize cache from DB
const initCache = (cb) => {
  readDBCache(() => {
    // Start cache write timer?
    if (!module.cacheStorage)
      module.cacheStorage = setTimeout(writeDBCache,
        reportingConfig.minInterval * 5);
    cb();
  });
};

routes.get('/v1/cf/bridge', throttle(function *(req) {
  return {
    body: {
      bridge: {
        config: {
          secured: secured,
          minIntervalTime: minIntervalTime,
          maxIntervalTime: maxIntervalTime,
          guidMinAge: guidMinAge,
          reporting: reportingConfig,
          purgeCompensation: compensationConfig
        },
        cache: omit(cache, 'apps'),
        performance: {
          cache: {
            read: perf.stats('cache.read'),
            write: perf.stats('cache.write')
          },
          paging: {
            pages: perf.stats('paging'),
            resources: perf.stats('paging.resources')
          },
          report: perf.stats('report'),
          usage: perf.stats('usage'),
          carryOver: perf.stats('carryOver'),
          save: perf.stats('save'),
          fetch: perf.stats('fetch'),
          compensation: perf.stats('compensation')
        },
        statistics: statistics
      }
    }
  };
}));

routes.post('/v1/cf/bridge/compensation', throttle(function *(req) {
  if (compensationConfig.inProgress)
    return { status: 409 };

  debug('Starting purge compensation ...');
  compensationConfig.inProgress = true;

  debug('Reading applications ...');
  module.appsReader = setTimeout(() => fetchCFApps(cfAdminToken, {
    success: () => {
      debug('Starting compensation reporting ...');
      module.purgeCompensation = setTimeout(() =>
        purgeCompensation(cfAdminToken, linuxContainerToken, {
          success: () => {
            cache.apps = [];
            compensationConfig.inProgress = false;
          },
          failure: () => {}
        }), 0);
    },
    failure: () => {}
  }), 0);

  return { status: 201 };
}, 1));

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

  if(secured)
    app.use(routes, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
  else
    app.use(routes);

  return app;
};

// Command line interface, create the bridge app and listen
const runCLI = () => bridge().listen();

// Export our public functions
module.exports = bridge;
module.exports.cache = cache;
module.exports.statistics = statistics;
module.exports.reportingConfig = reportingConfig;
module.exports.compensationConfig = compensationConfig;
module.exports.initCache = initCache;
module.exports.reportAppUsage = reportAppUsage;
module.exports.stopReporting = stopReporting;
module.exports.fetchCFApps = fetchCFApps;
module.exports.purgeCompensation = purgeCompensation;
module.exports.runCLI = runCLI;

