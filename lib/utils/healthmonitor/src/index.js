'use strict';

const moment = require('abacus-moment');
const debug = require('abacus-debug')('abacus-healthmonitor');

const createHealthMonitor = (monitorable, threshold, events) => {
  let isFailing = false;
  let leadingFailureTimestamp = 0;

  const onFailure = () => {
    debug('Failure event received.');
    if (isFailing) 
      return;
      
    isFailing = true;
    leadingFailureTimestamp = moment.now();
  };

  const onSuccess = () => {
    debug('Success event received.');
    isFailing = false;
  };
  
  events.success.forEach((successEventName) => monitorable.on(successEventName, onSuccess));
  events.failure.forEach((failureEventName) => monitorable.on(failureEventName, onFailure));

  const healthy = () => {
    const leadingFailureOccurredRecently = moment.now() < leadingFailureTimestamp + threshold;
    return !isFailing || leadingFailureOccurredRecently;
  };

  return {
    healthy
  };
};

module.exports = createHealthMonitor;
module.exports.createHealthMonitor = createHealthMonitor;
