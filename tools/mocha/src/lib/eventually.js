'use strict';

const moment = require('abacus-moment');
const edebug = require('abacus-debug')('e-abacus-mocha-eventually');
const { defaults } = require('underscore');

let _defaultPollingIntervalInMillis = 100;
let _defaultTimeoutInMillis = 60000;

const _sleep = (duration) => {
  return new Promise((cb) => setTimeout(cb, duration));
};

const setEventuallyPollingInterval = (pollingInterval) => {
  _defaultPollingIntervalInMillis = pollingInterval;
};

const setEventuallyTimeout = (timeout) => {
  _defaultTimeoutInMillis = timeout;
};

const eventually = async (func, options) => {
  const start = moment.now();

  const eventuallyConfig = defaults(options, {
    pollingInterval: _defaultPollingIntervalInMillis,
    timeout: _defaultTimeoutInMillis
  });

  while (moment.now() - start < eventuallyConfig.timeout) {
    try {
      return await func();
    } catch (e) {
      edebug('Eventually failed due to: %o', e.message);
    }
    await _sleep(eventuallyConfig.pollingInterval);
  }
  throw new Error(`Eventually timeout of ${eventuallyConfig.timeout} milliseconds exceeded`);
};

module.exports = {
  eventually,
  setEventuallyTimeout,
  setEventuallyPollingInterval
};

