'use strict';

const { isFunction } = require('underscore');
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

const isConstructor = (functionName) => functionName == 'constructor';

const throttledClient = (client) => {
  const wrapper = {};
  const functions = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter((prop) => isFunction(client[prop]))
    .filter((prop) => !isConstructor(prop));

  functions.forEach((functionName) => wrapper[functionName] = throttledFunction(client, client[functionName]));

  return wrapper;
};

module.exports = {
  throttledClient
};
