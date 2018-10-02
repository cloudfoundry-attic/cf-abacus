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
<<<<<<< HEAD
<<<<<<< HEAD
    .filter((prop) => !isConstructor(prop));

=======
    .filter((prop) => prop != 'constructor');
    
>>>>>>> fix throttler classes handling
=======
    .filter((prop) => !isConstructor(prop));

>>>>>>> add worker integration tests
  functions.forEach((functionName) => wrapper[functionName] = throttledFunction(client, client[functionName]));

  return wrapper;
};

module.exports = {
  throttledClient
};
