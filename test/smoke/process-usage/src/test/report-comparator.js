'use strict';

const { getThousandLightAPICallsWindows, getHeavyAPICallsWindows, getSpaceThousandLightAPICallsWindows, 
  getSpaceHeavyAPICallsWindows, getConsumerThousandLightAPICallsWindows, getConsumerHeavyAPICallsWindows 
} = require('./parse-report-utils');

const util = require('util');

// Compares the previous and expected window values based upon the
// summary, quantity and window delta
const _deltaCompare = (currentWindow, previousWindow, s, q) => {
  expect(currentWindow).to.not.equal(undefined, 'Missing current window');
  expect(previousWindow).to.not.equal(undefined, 'Missing previous window');

  const checkIfNear = (key, updatingStep) => {
    expect(updatingStep).to.not.equal(undefined, 'Missing updating step');
    expect(currentWindow[key]).to.not.equal(undefined, `Missing ${key} in updated month report`);
    expect(previousWindow[key]).to.not.equal(undefined, `Missing ${key} in previous month report`);

    const currentValue = currentWindow[key];
    const previousValue = previousWindow[key];
    
    expect(currentValue).to.not.equal(previousValue, util.format('No change in %s=%d detected', key, previousValue));

    const diff = currentValue - previousValue - updatingStep;

    expect(diff).to.be.closeTo(0, 0.01, util.format(
      '%s=%d, expected increase %d from %d, ∆=%d', key, currentValue, updatingStep, previousValue, diff
    ));
  };

  checkIfNear('summary', s);
  checkIfNear('quantity', q);
};

const _deltaCompareLightAPICalls = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompare(
    getThousandLightAPICallsWindows(updatedReport),
    getThousandLightAPICallsWindows(previousReport),
    summuries.lightAPICalls,
    quantites.lightAPICalls
  );

  _deltaCompare(
    getSpaceThousandLightAPICallsWindows(updatedReport),
    getSpaceThousandLightAPICallsWindows(previousReport),
    summuries.lightAPICalls,
    quantites.lightAPICalls
  );

  _deltaCompare(
    getConsumerThousandLightAPICallsWindows(updatedReport),
    getConsumerThousandLightAPICallsWindows(previousReport),
    summuries.lightAPICalls,
    quantites.lightAPICalls
  );
};

const _deltaCompareHeavyAPICalls = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompare(
    getHeavyAPICallsWindows(updatedReport),
    getHeavyAPICallsWindows(previousReport),
    summuries.heavyAPICalls,
    quantites.heavyAPICalls
  );

  _deltaCompare(
    getSpaceHeavyAPICallsWindows(updatedReport),
    getSpaceHeavyAPICallsWindows(previousReport),
    summuries.heavyAPICalls,
    quantites.heavyAPICalls
  );

  _deltaCompare(
    getConsumerHeavyAPICallsWindows(updatedReport),
    getConsumerHeavyAPICallsWindows(previousReport),
    summuries.heavyAPICalls,
    quantites.heavyAPICalls
  );
};

const deltaCompareReports = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompareLightAPICalls(updatedReport, previousReport, summuries, quantites);
  _deltaCompareHeavyAPICalls(updatedReport, previousReport, summuries, quantites);
};

module.exports = {
  deltaCompareReports
};
