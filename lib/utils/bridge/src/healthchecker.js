'use strict';

const moment = require('abacus-moment');
const debug = require('abacus-debug')('abacus-bridge-healthchecker');

const createHealthChecker = (bridge, threshold) => {

  let isFailing = false;
  let leadingFailureTimestamp = 0;

  const onBridgeFailure = () => {
    debug('Failure event received.');
    if (isFailing) return;
    isFailing = true;
    leadingFailureTimestamp = moment.now();
  };

  const onBridgeSuccess = () => {
    debug('Success event received.');
    isFailing = false;
  };

  bridge.on('usage.failure', onBridgeFailure);
  bridge.on('usage.success', onBridgeSuccess);

  const healthy = () => {
    const leadingFailureOccurredRecently =
      moment.now() < leadingFailureTimestamp + threshold;
    return !isFailing || leadingFailureOccurredRecently;
  };

  return {
    healthy
  };

};

module.exports = createHealthChecker;
module.exports.createHealthChecker = createHealthChecker;
