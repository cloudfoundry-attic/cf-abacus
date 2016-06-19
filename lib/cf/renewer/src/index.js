'use strict';

const _ = require('underscore');
const compact = _.compact;
const filter = _.filter;
const first = _.first;
const flatten = _.flatten;
const findWhere = _.findWhere;
const groupBy = _.groupBy;
const head = _.head;
const map = _.map;
const memoize = _.memoize;
const pairs = _.pairs;
const pick = _.pick;
const tail = _.tail;

const util = require('util');

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const cluster = require('abacus-cluster');
const dataflow = require('abacus-dataflow');
const dbclient = require('abacus-dbclient');
const moment = require('moment');
const oauth = require('abacus-oauth');
const perf = require('abacus-perf');
const request = require('abacus-request');
const retry = require('abacus-retry');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const usageSchemas = require('abacus-usage-schemas');
const webapp = require('abacus-webapp');

const reliableRequest = throttle(retry(breaker(batch(request))));

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-renew');
const edebug = require('abacus-debug')('e-abacus-cf-renew');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = memoize(() => urienv({
  api      : 80,
  collector: 9080,
  db       : 5984
}));

// Function call statistics
const statistics = {
  usage: {
    missingToken: 0,
    reportFailures: 0,
    reportSuccess: 0,
    reportConflict: 0
  }
};

const oneDayInMilliseconds = 86400000;

// Use secure routes or not
const secured = process.env.SECURED === 'true';

// Token for reporting usage
const linuxContainerToken = secured ? oauth.cache(uris().api,
  process.env.CLIENT_ID, process.env.CLIENT_SECRET,
  'abacus.usage.linux-container.write abacus.usage.linux-container.read') :
  undefined;

// DB for storing the last processed app and app-usage GUIDs
const collectorDb = throttle(retry(breaker(batch(
  dbclient(dataflow.partition(),
    dbclient.dburi(uris().db, 'abacus-collector-collected-usage'))
))));

const authHeader = (token) => token ? { authorization: token() } : {};

const reportUsage = (usage, token, cb) => {
  const t0 = Date.now();
  reliableRequest.post(':collector/v1/metering/collected/usage', {
    collector: uris().collector,
    headers: authHeader(token),
    body: usage
  }, (error, response) => {
    if (!error && response) {
      if (response.statusCode === 201) {
        debug('Successfully reported usage %j with headers %j',
          usage, response.headers);
        statistics.usage.reportSuccess++;
        perf.report('report', t0);
        cb();
        return;
      }
      if (response.statusCode === 409) {
        debug('Conflicting usage %j. Response: %j', usage, response);
        statistics.usage.reportConflict++;
        perf.report('report', t0, undefined, undefined, undefined, 'rejected');
        cb();
        return;
      }
    }
    const message = util.format('Failed reporting\n\tusage %j\n\terror %j' +
      '\n\tresponse %j', usage, error, response);
    edebug(message);
    statistics.usage.reportFailures++;
    perf.report('report', t0, undefined, new Error(error));
    cb(error, response);
  });
};

const moveToNextMonth = (usage) => {
  usage.start = moment(usage.start).add(1, 'month').valueOf();
  usage.end = moment(usage.end).add(1, 'month').valueOf();
  return usage;
};

const reportUsageDocuments = (docs, abacusToken, { failure, success }) => {
  if (!docs || docs.length === 0) {
    debug('No more documents to process');
    success();
    return;
  }

  const usage = head(docs);
  reportUsage(moveToNextMonth(usage), abacusToken, (error, response) => {
    if (error || response) {
      failure(error, response);
      return;
    }
    reportUsageDocuments(tail(docs), abacusToken, { failure, success });
  });
};

const resourceUsageSchemaProperties = map(
  pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);

const extractUsageDocs = (usageDocs) => map(usageDocs, (usageDoc) =>
  pick(usageDoc.doc, resourceUsageSchemaProperties));

const filterTimeBasedMetrics = (usageDocs) => {
  const timeBasedMetrics = filter(usageDocs,
    // TODO: Filter based on metric type
    (doc) => doc.resource_id == 'linux-container');

  debug('Selected %d time-based metrics from %d usage documents',
    timeBasedMetrics.length, usageDocs.length);
  return timeBasedMetrics;
};

const buildKey = (doc) => util.format('%s/%s/%s/%s/%s/%s/%s',
  doc.organization_id, doc.event, doc.space_id, doc.consumer_id,
  doc.resource_id, doc.plan_id, doc.resource_instance_id);

const stalledCriteria = { measure: 'current_instance_memory', quantity: 0 };

// We expect usageDocs to be ordered **descending**. This is guaranteed by
// dbclient.allDocs
const removeStalledUsage = (usageDocs) => {
  debug('Will scan %d usage docs for stalled usage', usageDocs.length);

  const groups = groupBy(usageDocs, (doc) => buildKey(doc));
  debug('Split usage docs in %d groups', Object.keys(groups).length);

  const noStalledUsage = compact(map(groups, (group) => {
    const latestUsage = first(group);
    if (findWhere(latestUsage.measured_usage, stalledCriteria)) {
      debug('Found stalled usage %j', latestUsage);
      return undefined;
    }
    return latestUsage;
  }));

  // Get rid of the group keys
  const normalizedUsageDocs = flatten(map(noStalledUsage, (doc) => doc));
  debug('Removed %d usage documents in total',
    usageDocs.length - normalizedUsageDocs.length);
  return normalizedUsageDocs;
};

const setRenewTimeout = (fn , interval) => {
  clearTimeout(module.usageRenewer);
  module.usageRenewer = setTimeout(fn, interval);
  debug('Reporting interval set to %d ms', interval);
};

const renewUsage = (abacusToken, { failure, success }) => {
  debug('Usage renew started ...');

  if (secured && !abacusToken()) {
    edebug('Missing resource provider token');
    setRenewTimeout(() =>
      renewUsage(abacusToken, {
        failure: failure,
        success: success
      }), 5000);
    statistics.usage.missingToken++;
    failure('Missing resource provider token');
    return;
  }

  // Calculate previous month boundaries
  const startOfPreviousMonth =
    moment().utc().subtract(1, 'months').startOf('month');
  const startOfThisMonth =
    moment().utc().startOf('month');
  debug('Will scan for usage between %s and %s',
    startOfPreviousMonth.toISOString(), startOfThisMonth.toISOString());

  // Compute the query range
  const startId = dbclient.tkuri(String.fromCharCode(0),
    seqid.pad16(startOfPreviousMonth.valueOf()));
  // We search up to next month start and this involves additional DB query.
  // If we want to scan just the previous month we should know the biggest key
  // Then the next line would look like:
  //   dbclient.tkuri(biggestKey, seqid.pad16(endOfMonth.valueOf()));
  const endId = dbclient.tkuri(String.fromCharCode(0),
    seqid.pad16(startOfThisMonth.valueOf()));
  debug('Searching for docs in the range [%s, %s)', startId, endId);

  // Fetch all docs from the previous month
  collectorDb.allDocs({
    include_docs: true,
    descending: true,
    endkey: startId,
    startkey: endId
  }, (err, docs) => {
    if (err) {
      failure(err);
      return;
    }

    debug('Found %d DB documents ...', docs.rows.length);
    const usageDocs = removeStalledUsage(
      filterTimeBasedMetrics(extractUsageDocs(docs.rows)));
    debug('Will process %d documents ...', usageDocs.length);
    reportUsageDocuments(usageDocs, abacusToken, { failure, success });
  });

  debug('Scheduling next execution on %s',
    moment().add(oneDayInMilliseconds, 'milliseconds').toDate());
  module.usageRenewer = setTimeout(() => renewUsage(
    abacusToken, {
      failure, success
    }),
    oneDayInMilliseconds);
};

const stopRenewer = (cb = () => {}) => {
  edebug('Cancelling timers');
  clearTimeout(module.usageRenewer);

  if (typeof cb === 'function')
    cb();
};

const startRenewer = () => {
  debug('Starting renewer ...');

  // Start token functions
  if (secured)
    linuxContainerToken.start();

  setRenewTimeout(() => renewUsage(linuxContainerToken, {
    success: () => {
      debug('Renewer completed successfully');
    },
    failure: (err) => {
      debug('Renewer failed due to %j', err);
    }
  }), 0);

  // Cancel scheduled timers
  process.on('exit', stopRenewer);
};

routes.get('/v1/cf/renewer', throttle(function *(req) {
  return {
    body: {
      renewer: {
        performance: {
          report: perf.stats('report')
        },
        statistics: statistics
      }
    }
  };
}));

// Create a CF renew app
const renew = () => {
  debug('Starting renew app ...');
  cluster.singleton();

  if (cluster.isWorker()) {
    debug('Starting renew worker');
    startRenewer();
  }

  // Create the Webapp
  const app = webapp();

  if(secured)
    app.use(routes, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
  else
    app.use(routes);

  return app;
};

// Command line interface, create the renew app and listen
const runCLI = () => renew().listen();

// Export our public functions
module.exports = renew;
module.exports.statistics = statistics;
module.exports.stopRenewer = stopRenewer;
module.exports.renewUsage = renewUsage;
module.exports.removeStalledUsage = removeStalledUsage;
module.exports.runCLI = runCLI;

