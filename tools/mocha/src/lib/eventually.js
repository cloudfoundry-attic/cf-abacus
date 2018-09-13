'use strict';

let _defaultPollingIntervalInMillis = 100;

const sleep = (duration) => {
  return new Promise((cb) => setTimeout(cb, duration));
};

const setEventuallyPollingInterval = (pollingInterval) => {
  _defaultPollingIntervalInMillis = pollingInterval;
};

const eventually = async (func, pollingInterval = _defaultPollingIntervalInMillis) => {
  while (true) {
    try {
      return await func();
    } catch (e) {
      console.log('Eventually failed due to: %o', e.message);
    }
    await sleep(pollingInterval);
  }
};


module.exports = {
  eventually,
  setEventuallyPollingInterval
};
