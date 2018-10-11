'use strict';

const { getThousandLightApiCallsQuantity } = require('./parse-report-utils');

// Compares the previous and expected window values based upon the
// summary, quantity and window delta
const deltaCompare = (currentWindow, previousWindow, s, q) => {
  expect(currentWindow).to.not.equal(undefined, 'Missing current window');
  expect(previousWindow).to.not.equal(undefined, 'Missing previous window');

  const checkIfNear = (key, increment, current, previous) => {
    if (
      typeof increment !== 'undefined' &&
      typeof current[key] !== 'undefined' &&
      typeof previous[key] !== 'undefined'
    ) {
      const currentValue = current[key];
      const previousValue = previous[key];
      let message = util.format('No change in %s=%d detected', key, previousValue);
      expect(currentValue).to.not.equal(previousValue, message);

      const diff = currentValue - previousValue - increment;
      message = util.format(
        '%s=%d, expected increase %d from %d, ∆=%d',
        key,
        currentValue,
        increment,
        previousValue,
        diff
      );
      expect(Math.abs(diff)).to.be.below(0.01, message);
    }
  };
  checkIfNear('summary', s, currentWindow, previousWindow);
  checkIfNear('quantity', q, currentWindow, previousWindow);
};

const deltaCompareReports = (updatedReport, previousReport) => {
  deltaCompare(
    updatedReport.resources[0].plans[0].aggregated_usage[1].windows,
    previousReport.resources[0].plans[0].aggregated_usage[1].windows,
    3,
    3
  );
  deltaCompare(
    updatedReport.resources[0].plans[0].aggregated_usage[2].windows,
    previousReport.resources[0].plans[0].aggregated_usage[2].windows,
    300,
    300
  );

  deltaCompare(
    updatedReport.spaces[0].resources[0].plans[0].aggregated_usage[1].windows,
    previousReport.spaces[0].resources[0].plans[0].aggregated_usage[1].windows,
    3,
    3
  );
  deltaCompare(
    updatedReport.spaces[0].resources[0].plans[0].aggregated_usage[2].windows,
    previousReport.spaces[0].resources[0].plans[0].aggregated_usage[2].windows,
    300,
    300
  );

  deltaCompare(
    updatedReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[1].windows,
    previousReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[1].windows,
    3,
    3
  );
  deltaCompare(
    updatedReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[2].windows,
    previousReport.spaces[0].consumers[0].resources[0].plans[0].aggregated_usage[2].windows,
    300,
    300
  );
};

const compareReports = (current, updated, initialExpectedReport) => {
  if(getThousandLightApiCallsQuantity(current) !== 0) 
    deltaCompareReports(updated, current);
  else 
    expect(updated).to.deep.equal(initialExpectedReport);
};

module.exports = {
  compareReports
};
