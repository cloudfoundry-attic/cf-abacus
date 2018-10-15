'use strict';

const clone = require('abacus-clone');

const { omit } = require('underscore');

const objectStorageIndex = 0;
const objectStoragePlanIdIndex = 0;
const thousandLightApiCallsIndex = 1;
const heavyApiCallsIndex = 2;
const spaceIndex = 0;
const consumerIndex = 0;
const monthReport = 4;
const currentMonth = 0;


const _getCurrentMonth = (windows) => windows[monthReport][currentMonth];

const _removeConsumerMetadata = (report) => {
  const testResourceInstanceIndex = 0;
  report.spaces[spaceIndex].consumers[consumerIndex].resources[objectStorageIndex].plans[objectStoragePlanIdIndex]
    .resource_instances[testResourceInstanceIndex] = omit(report.spaces[spaceIndex].consumers[consumerIndex]
      .resources[objectStorageIndex].plans[objectStoragePlanIdIndex].resource_instances[testResourceInstanceIndex],
    't',
    'p'
    );
  return report;
};

const getThousandLightApiCallsWindows = (report) => _getCurrentMonth(report.resources[objectStorageIndex]
  .plans[objectStoragePlanIdIndex].aggregated_usage[thousandLightApiCallsIndex].windows);
  
const getHeavyApiCallsWindows = (report) => _getCurrentMonth(report.resources[objectStorageIndex]
  .plans[objectStoragePlanIdIndex].aggregated_usage[heavyApiCallsIndex].windows);
  
const getSpaceThousandLightApiCallsWindows = (report) => getThousandLightApiCallsWindows(
  report.spaces[spaceIndex]);
  
const getSpaceHeavyApiCallsWindows = (report) => getHeavyApiCallsWindows(report.spaces[spaceIndex]);

const getConsumerThousandLightApiCallsWindows = (report) => getThousandLightApiCallsWindows(
  report.spaces[spaceIndex].consumers[consumerIndex]);
  
const getConsumerHeavyApiCallsWindows = (report) => getHeavyApiCallsWindows(
  report.spaces[spaceIndex].consumers[consumerIndex]);  
  
const cleanReport = (report) => _removeConsumerMetadata(
  clone(omit(report, 'id', 'processed', 'processed_id', 'start', 'end')));  
  
const getThousandLightApiCallsQuantity = (report) => {
  try { 
    const monthReport = getThousandLightApiCallsWindows(report);
    return monthReport.quantity;
  } catch (e) {
    // The response doesn't contain a valid report
    return 0;
  }
};

module.exports = {
  cleanReport,
  getHeavyApiCallsWindows,
  getThousandLightApiCallsWindows,
  getThousandLightApiCallsQuantity,
  getSpaceThousandLightApiCallsWindows,
  getSpaceHeavyApiCallsWindows,
  getConsumerThousandLightApiCallsWindows,
  getConsumerHeavyApiCallsWindows
};
