'use strict';

const clone = require('abacus-clone');

const { omit } = require('underscore');

const removeTandP = (report) => {
  report.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0] = omit(
    report.spaces[0].consumers[0].resources[0].plans[0].resource_instances[0],
    't',
    'p'
  );
  return report;
};

const cleanReport = (report) => removeTandP(clone(omit(report, 'id', 'processed', 'processed_id', 'start', 'end')));


const getThousandLightApiCallsQuantity = (report) => {
  const objectStorageIndex = 0;
  const objectStoragePlanIdIndex = 0;
  const thousandLightApiCallsIndex = 1;
  const monthReport = 4;
  const currentMonth = 0;
  try {
    return report.resources[objectStorageIndex].plans[objectStoragePlanIdIndex]
      .aggregated_usage[thousandLightApiCallsIndex].windows[monthReport][currentMonth].quantity;
  } catch (e) {
    // The response doesn't contain a valid report
    return 0;
  }
};

module.exports = {
  cleanReport,
  getThousandLightApiCallsQuantity
};
