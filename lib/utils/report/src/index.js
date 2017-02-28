'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const moment = require('abacus-moment');
const perf = require('abacus-perf');
const request = require('abacus-request');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-report');
const edebug = require('abacus-debug')('e-abacus-report');

// Resolve service URIs
const uris = memoize(() => urienv({
  collector  : 9080
}));

const throttleLimit = process.env.THROTTLE ? parseInt(process.env.THROTTLE) :
  100;
const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) :
  100;

// if a batch is throttled, then throttle limits the number of calls made to
// the batch function limiting the number of batches. In order to avoid that
// all the batch functions when throttled should have a throttle value that is
// multiplied by the batch.
const reliableRequest = throttle(retry(breaker(batch(request))),
  batchSize * throttleLimit);

const secured = process.env.SECURED === 'true';

const authHeader = (token) => token ? { authorization: token() } : {};

// Report usage utility. Use like this:
//
// const statistics = {
//   usage: {
//     missingToken: 0,
//     reportFailures: 0,
//     reportSuccess: 0,
//     reportConflict: 0,
//     reportBusinessError: 0
//   }
// };
// const errors = {
//   missingToken: false,
//   noReportEverHappened: true,
//   consecutiveReportFailures: 0,
//   lastError: '',
//   lastErrorTimestamp: ''
// };
// const errorFn = (message, error, response, name, time) => { ... };
//
// const reporter = require('abacus-report')(statistics, errors);
// reporter.reportUsage(usage, token, (error, response) => {
//   ... <process error> ...
//   ... <use the response> ...
// });
const reporter = (statistics, errors, errorFn) => {

  const registerError = (message, error, response, name, time) => {
    const errorMessage = error || response ?
      util.format('%s; error: %s; response: %j', message, error, response) :
      message;

    errors.lastError = errorMessage;
    errors.lastErrorTimestamp = moment.utc().toISOString();

    edebug(errorMessage);

    if (name && time)
      perf.report(name, time, undefined, new Error(errorMessage));
  };

  const errorCb = errorFn ? errorFn : registerError;

  const processMissingToken = (cb) => {
    statistics.usage.missingToken++;
    errors.missingToken = true;

    const message = 'Missing resource token';
    debug(message);
    errorCb(message);

    cb(new Error(message), undefined);
  };

  const processSuccessfulReport = (response, usage, t0, cb) => {
    if (!response.headers || !response.headers.location) {
      const message = util.format('No Location header found in ' +
        'response %j for usage %j', response, usage);
      edebug(message);
      throw new Error(message);
    }

    debug('Successfully reported usage %j with headers %j',
      usage, response.headers);
    statistics.usage.reportSuccess++;
    errors.noReportEverHappened = false;
    errors.consecutiveReportFailures = 0;
    perf.report('report', t0);

    cb(undefined, response);
  };

  const processBusinessErrorReport = (response, usage, t0, cb) => {
    statistics.usage.reportBusinessError++;
    const message = util.format('Business error for usage %j. Response: %j',
      usage, response);
    debug(message);
    perf.report('report', t0, undefined, undefined, undefined, 'rejected');

    if (response.statusCode === 409) {
      statistics.usage.reportConflict++;
      errors.noReportEverHappened = false;
      cb(undefined, response);
      return;
    }

    statistics.usage.reportFailures++;
    errors.consecutiveReportFailures++;
    const error = extend(new Error(), response.body);
    errorCb(message, error, undefined, 'report', t0);
    cb(error, response);
  };

  const processFailedReport = (error, response, t0, cb) => {
    statistics.usage.reportFailures++;
    errors.consecutiveReportFailures++;

    const message = util.format(
      'Failed reporting usage. Consecutive failures: %d',
      errors.consecutiveReportFailures
    );
    errorCb(message, error, undefined, 'report', t0);

    cb(error ? error : new Error(message), response);
  };

  const processReportError = (error, response, t0, cb) => {
    statistics.usage.reportFailures++;
    errors.consecutiveReportFailures++;

    const message = util.format('Failed reporting usage. ' +
      'Consecutive failures: %d', errors.consecutiveReportFailures);
    errorCb(message, error, response, 'report', t0);

    cb(error, response);
  };

  const reportUsage = (usage, token, cb = () => {}) => {
    const t0 = moment.now();

    if (secured && !token()) {
      processMissingToken(cb);
      return;
    }
    errors.missingToken = false;

    reliableRequest.post(':collector/v1/metering/collected/usage', {
      collector: uris().collector,
      headers: authHeader(token),
      body: usage
    }, (error, response) => {
      // Error or no response
      if (error || !response) {
        processReportError(error, response, t0, cb);
        return;
      }

      // Business error
      if (response.body && response.body.error) {
        processBusinessErrorReport(response, usage, t0, cb);
        return;
      }

      // Response
      if (response.statusCode === 201)
        processSuccessfulReport(response, usage, t0, cb);
      else
        processFailedReport(error, response, t0, cb);
    });
  };

  return {
    reportUsage: reportUsage,
    registerError: errorCb
  };
};

// Export our public functions
module.exports = reporter;
