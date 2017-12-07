'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const defaults = _.defaults;
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
const debug = require('abacus-debug')('abacus-client');
const xdebug = require('abacus-debug')('x-abacus-client');
const edebug = require('abacus-debug')('e-abacus-client');

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
// const errors = {
//   missingToken: false,
//   noReportEverHappened: true,
//   consecutiveReportFailures: 0,
//   lastError: '',
//   lastErrorTimestamp: ''
// };
// const errorFn = (message, error, response, name, time) => { ... };
//
// const reporter = require('abacus-client')(errors);
// reporter.reportUsage(usage, token, (error, response) => {
//   ... <process error> ...
//   ... <use the response> ...
// });
const reporter = (errors, errorFn) => {

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
    errors.missingToken = true;

    const message = 'Missing resource token';
    debug(message);
    errorCb(message);

    const err = new Error(message);
    xdebug('Calling back with error: %o and no response', err);
    cb(err, undefined);
  };

  const processSuccessfulReport = (response, usage, t0, cb) => {
    if (!response.headers || !response.headers.location) {
      const message = util.format('No Location header found in ' +
        'response %j for usage %j', response, usage);
      edebug(message);
      cb(new Error(message));
      return;
    }

    debug('Successfully reported usage %j with headers %j',
      usage, response.headers);
    errors.noReportEverHappened = false;
    errors.consecutiveReportFailures = 0;
    perf.report('report', t0);

    xdebug('Calling back without error and response: %o', response);
    cb(undefined, response);
  };

  const processBusinessErrorReport = (response, usage, t0, cb) => {
    const message = util.format('Business error for usage %j. Response: %j',
      usage, response);
    debug(message);

    if (response.statusCode === 409) {
      errors.noReportEverHappened = false;
      errors.consecutiveReportFailures = 0;

      perf.report('report', t0);

      xdebug('Calling back without error and response: %o', response);
      cb(undefined, response);
      return;
    }

    perf.report('report', t0, undefined, undefined, undefined, 'rejected');
    errors.consecutiveReportFailures++;
    const error = extend(new Error(), response.body);
    errorCb(message, error, undefined, 'report', t0);

    xdebug('Calling back with error: %o and response: %o', error, response);
    cb(error, response);
  };

  const processFailedReport = (error, response, t0, cb) => {
    errors.consecutiveReportFailures++;

    const message = util.format(
      'Failed reporting usage. Consecutive failures: %d',
      errors.consecutiveReportFailures
    );
    errorCb(message, error, undefined, 'report', t0);

    const err = error ? error : new Error(message);
    xdebug('Calling back with error: %o and response: %o', err, response);
    cb(err, response);
  };

  const processReportError = (error, response, t0, cb) => {
    errors.consecutiveReportFailures++;

    const message = util.format('Failed reporting usage. ' +
      'Consecutive failures: %d', errors.consecutiveReportFailures);
    errorCb(message, error, response, 'report', t0);

    xdebug('Calling back with error: %o and response: %o', error, response);
    cb(error, response);
  };

  const reportUsage = (usage, token, cb = () => {}) => {
    const t0 = moment.now();
    xdebug('Reporting usage %o', usage);

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

const poll = (fn, opts, done) => {
  const startTimestamp = moment.now();
  const options = defaults(opts, {
    pollInterval: 1000,
    successCount: 5
  });

  let successCount = 0;

  const doneCallback = (err) => {
    if (!err) {
      ++successCount;
      debug('Expectation in %s met (%d/%d)',
        fn.name, successCount, options.successCount);

      if (successCount === options.successCount) {
        debug('Polling finished successfully');
        done();
        return;
      }
    }
    else {
      successCount = 0;
      debug('Check failed. Resetting success count to 0');
    }

    debug('Checking total timeout %d', options.totalTimeout);
    if (moment.now() - startTimestamp > options.totalTimeout) {
      debug('Expectation not met for %d ms. Error: %o',
        options.totalTimeout, err);
      done(new Error(err));
    }
    else {
      debug('Scheduling new execution of %s after %d',
        fn.name, options.pollInterval);
      setTimeout(() => {
        debug('Calling %s ...', fn.name);
        if (options.checkFn)
          fn(options.checkFn, doneCallback);
        else
          fn(doneCallback);
      }, options.pollInterval);
    }
  };

  debug('Calling %s for the first time...', fn.name);
  if (options.checkFn)
    fn(options.checkFn, doneCallback);
  else
    fn(doneCallback);
};

const waitForStartAndPoll = (url, fn, opts, cb) => {
  const startWaitTime = moment.now();
  const options = defaults(opts, {
    headers: authHeader(opts.token),
    startTimeout: 5000,
    totalTimeout: 10000
  });

  debug('Waiting for url %s to start with options %o', url, options);
  request.waitFor(url, options, options.startTimeout, (err, uri) => {
    // Failed to ping component before timing out
    if (err) {
      edebug('Failed requesting url %s, %o', url, err);
      cb(err);
      return;
    }

    // Ensure that endpoint is fully functional
    request.get(uri, options, (err, response) => {
      expect(err).to.equal(undefined);
      expect(response.statusCode).to.equal(200);

      const t = options.totalTimeout - (moment.now() - startWaitTime);
      debug('Time left for executing check: %d ms', t);
      poll(fn, options, (error) => {
        cb(error);
      });
    });
  });
};

// Export our public functions
module.exports = reporter;
module.exports.poll = poll;
module.exports.waitForStartAndPoll = waitForStartAndPoll;
