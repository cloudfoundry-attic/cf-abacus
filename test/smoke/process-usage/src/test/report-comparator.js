'use strict';

const { getThousandLightApiCallsWindows, getHeavyApiCallsWindows, getSpaceThousandLightApiCallsWindows, 
  getSpaceHeavyApiCallsWindows, getConsumerThousandLightApiCallsWindows, getConsumerHeavyApiCallsWindows 
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

    expect(Math.abs(diff)).to.be.below(0.01, util.format(
      '%s=%d, expected increase %d from %d, ∆=%d', key, currentValue, updatingStep, previousValue, diff
    ));
  };

  checkIfNear('summary', s);
  checkIfNear('quantity', q);
};

const _deltaCompareLightApiCalls = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompare(
    getThousandLightApiCallsWindows(updatedReport),
    getThousandLightApiCallsWindows(previousReport),
    summuries.lightApiCalls,
    quantites.lightApiCalls
  );

  _deltaCompare(
    getSpaceThousandLightApiCallsWindows(updatedReport),
    getSpaceThousandLightApiCallsWindows(previousReport),
    summuries.lightApiCalls,
    quantites.lightApiCalls
  );

  _deltaCompare(
    getConsumerThousandLightApiCallsWindows(updatedReport),
    getConsumerThousandLightApiCallsWindows(previousReport),
    summuries.lightApiCalls,
    quantites.lightApiCalls
  );
};

const _deltaCompareHeavyApiCalls = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompare(
    getHeavyApiCallsWindows(updatedReport),
    getHeavyApiCallsWindows(previousReport),
    summuries.heavyApiCalls,
    quantites.heavyApiCalls
  );

  _deltaCompare(
    getSpaceHeavyApiCallsWindows(updatedReport),
    getSpaceHeavyApiCallsWindows(previousReport),
    summuries.heavyApiCalls,
    quantites.heavyApiCalls
  );

  _deltaCompare(
    getConsumerHeavyApiCallsWindows(updatedReport),
    getConsumerHeavyApiCallsWindows(previousReport),
    summuries.heavyApiCalls,
    quantites.heavyApiCalls
  );
};

const deltaCompareReports = (updatedReport, previousReport, summuries, quantites) => {
  _deltaCompareLightApiCalls(updatedReport, previousReport, summuries, quantites);
  _deltaCompareHeavyApiCalls(updatedReport, previousReport, summuries, quantites);
};

module.exports = {
  deltaCompareReports
};
