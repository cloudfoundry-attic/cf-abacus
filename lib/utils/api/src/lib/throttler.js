'use strict';

const { functions } = require('underscore');
const moment = require('abacus-moment');
const { TooManyRequestsError } = require('./errors');

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const throttledFunction = (owner, original) => {
  let sleepUntil = undefined;
  return async function () {
    if (sleepUntil && moment.utc().isBefore(sleepUntil))
      await sleep(sleepUntil.diff(moment.utc()));

    try {
      return await original.apply(owner, arguments);
    } catch (e) {
      if (e instanceof TooManyRequestsError)
        sleepUntil = moment.utc().add(e.retryAfter, 'seconds');
      throw e;
    }
  };
};

const throttledClient = (client) => {
  const wrapper = {};
  for (let functionName of functions(client))
    wrapper[functionName] = throttledFunction(client, client[functionName]);
  return wrapper;
};

module.exports = {
  throttledClient
};
