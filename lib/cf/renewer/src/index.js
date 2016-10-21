'use strict';

const _ = require('underscore');
const extend = _.extend;
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
const dbclient = require('abacus-dbclient');
const moment = require('moment');
const oauth = require('abacus-oauth');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const request = require('abacus-request');
const retry = require('abacus-retry');
const router = require('abacus-router');
const seqid = require('abacus-seqid');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');
const usageSchemas = require('abacus-usage-schemas');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

const throttleLimit = process.env.THROTTLE ? parseInt(process.env.THROTTLE) :
  100;
const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) :
  100;

// if a batch is throttled then, throttle limits the number of calls made to
// the batch function limiting the number of batches. In order to avoid that
// all the batch functions when throttled should have a throttle value that is
// multiplied by the batch.
const reliableRequest = throttle(retry(breaker(batch(request))),
  batchSize * throttleLimit);

const yieldableReliableRequest = yieldable(reliableRequest);

// Setup debug log
const debug = require('abacus-debug')('abacus-cf-renewer');
const edebug = require('abacus-debug')('e-abacus-cf-renewer');

// Create an express router
const routes = router();

// Resolve service URIs
const uris = memoize(() => urienv({
  api         : 80,
  collector   : 9080,
  db          : 5984,
  provisioning: 9880
}));

// Retry config
const oneDayInMilliseconds = 86400000;
const retryConfig = {
  retryInterval : parseInt(process.env.RETRY_INTERVAL) || oneDayInMilliseconds
};

// Function call statistics
const statistics = {
  usage: {
    missingToken: 0,
    getFailures: 0,
    getSuccess: 0,
    reportFailures: 0,
    reportSuccess: 0,
    reportConflict: 0
  },
  plan: {
    getFailures: 0,
    getSuccess: 0
  },
  retries: {
    count: 0
  }
};

// Use secure routes or not
const secured = process.env.SECURED === 'true';

// Abacus system token
const systemToken = secured ? oauth.cache(uris().api,
  process.env.ABACUS_CLIENT_ID, process.env.ABACUS_CLIENT_SECRET,
  'abacus.usage.write abacus.usage.read') :
  undefined;

// DB for storing the last processed app and app-usage GUIDs
const carryOverDB = yieldable(throttle(retry(breaker(batch(
  dbclient(partition.partition, dbclient.dburi(uris().db, 'abacus-carry-over'))
)))));

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

const zeroUsage = (usage) => {
  const clonedUsage = extend({}, usage);

  for(let measureObject of clonedUsage.measured_usage)
    if (measureObject.measure.startsWith('previous'))
      measureObject.quantity = 0;

  return clonedUsage;
};

const refreshUsage = (usage) => {
  const monthStart = moment().utc().startOf('month').valueOf();
  usage.start = monthStart;
  usage.end = monthStart;
  return zeroUsage(usage);
};

const reportUsageDocuments = (docs, systemToken, { failure, success }) => {
  if (!docs || docs.length === 0) {
    debug('No more documents to process');
    success();
    return;
  }

  const usage = head(docs);
  reportUsage(refreshUsage(usage), systemToken, (error, response) => {
    if (error || response) {
      failure(error, response);
      return;
    }
    reportUsageDocuments(tail(docs), systemToken, { failure, success });
  });
};

const extractUsageDocs = (usageDocs) =>
  map(usageDocs, (usageDoc) => usageDoc.doc);

const resourceUsageSchemaProperties = map(
  pairs(usageSchemas.resourceUsage.json().properties), (p) => p[0]);

const sanitizeUsageDoc = (usageDoc) => pick(usageDoc,
  resourceUsageSchemaProperties);

const getError = (id, response) => {
  debug('Get error, document id %s, response %o', id, response);
  return extend({}, {
    id: id,
    status: response.statusCode
  }, response.body || {});
};

const getUsageDocs = function *(references, systemToken) {
  const usageDocs = [];
  for (let id of references) {
    const t0 = Date.now();
    try {
      const response = yield yieldableReliableRequest.get(
        ':collector/v1/metering/collected/usage/:usage_id',
        {
          collector: uris().collector,
          usage_id: id,
          headers: authHeader(systemToken)
        }
      );

      if (response && response.statusCode != 200)
        throw getError(id, response);

      debug('Successfully got usage %j for document id %s with headers %j',
        response.body, id, response.headers);
      statistics.usage.getSuccess++;
      perf.report('get', t0);

      usageDocs.push(sanitizeUsageDoc(response.body));
    }
    catch(exc) {
      edebug(util.format('Failed to get usage due to error %j', exc));
      statistics.usage.getFailures++;
      perf.report('get', t0, undefined, exc);

      throw exc;
    }
  }

  return usageDocs;
};

const setRenewTimeout = (fn , interval) => {
  clearTimeout(module.usageRenewer);
  module.usageRenewer = setTimeout(fn, interval);
  debug('Retry interval set to %d ms after %d retries',
    interval, statistics.retries.count);
  statistics.retries.count++;
};

const renewUsage = (systemToken, { failure, success }) => {
  debug('Usage renewer started ...');

  if (secured && !systemToken()) {
    edebug('Missing token');
    setRenewTimeout(() => renewUsage(systemToken, { failure, success }),
      5000);
    statistics.usage.missingToken++;
    failure('Missing token');
    return;
  }

  debug('Scheduling next execution on %s',
    moment().add(retryConfig.retryInterval, 'milliseconds').toDate());
  setRenewTimeout(() => renewUsage(systemToken, { failure, success }),
    retryConfig.retryInterval);

  yieldable.functioncb(function *() {
    // Calculate previous month boundaries
    const startOfPreviousMonth =
      moment().utc().subtract(1, 'months').startOf('month');
    const endOfPreviousMonth =
      moment().utc().subtract(1, 'months').endOf('month');
    debug('Will scan for usage between %s and %s',
      startOfPreviousMonth.toISOString(), endOfPreviousMonth.toISOString());

    // Compute the query range
    const startId = dbclient.kturi(String.fromCharCode(0),
      seqid.pad16(startOfPreviousMonth.valueOf()));
    const endId = dbclient.kturi(String.fromCharCode(Number.MAX_SAFE_INTEGER),
      seqid.pad16(endOfPreviousMonth.valueOf()));
    debug('Searching for docs in the range [%s, %s)', startId, endId);

    // Fetch all docs from the previous month
    const docs = yield carryOverDB.allDocs({
      include_docs: true,
      startkey: startId,
      endkey: endId
    });
    debug('Found %d DB documents ...', docs.rows.length);

    const references = extractUsageDocs(docs.rows);
    return yield getUsageDocs(references, systemToken);
  })((error, docs) => {
    if (error) {
      failure(error);
      return;
    }

    debug('Will process %d documents ...', docs.length);
    reportUsageDocuments(docs, systemToken, { failure, success });
  });
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
    systemToken.start();

  setRenewTimeout(() => renewUsage(systemToken, {
    success: () => {
      debug('Renewer completed successfully');
    },
    failure: (err) => {
      edebug('Renewer failed due to %o', err);
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
          get: perf.stats('get'),
          report: perf.stats('report'),
          plan: perf.stats('plan')
        },
        statistics: statistics
      }
    }
  };
}));

// Create a CF renew app
const renew = () => {
  debug('Starting renewer app ...');
  cluster.singleton();

  if (cluster.isWorker()) {
    debug('Starting renewer worker');
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
module.exports.retryConfig = retryConfig;
module.exports.sanitizeUsageDoc = sanitizeUsageDoc;
module.exports.statistics = statistics;
module.exports.stopRenewer = stopRenewer;
module.exports.renewUsage = renewUsage;
module.exports.zeroUsage = zeroUsage;
module.exports.runCLI = runCLI;

