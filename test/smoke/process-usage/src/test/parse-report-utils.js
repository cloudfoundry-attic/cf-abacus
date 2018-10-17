'use strict';

const clone = require('abacus-clone');

const { omit } = require('underscore');

const objectStorageIndex = 0;
const objectStoragePlanIdIndex = 0;
const thousandLightAPICallsIndex = 1;
const heavyAPICallsIndex = 2;
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

const _reportReady = (report) => {
  const resources = report.resources;
  return resources && resources.length !== 0;
};

const getThousandLightAPICallsWindows = (report) => _getCurrentMonth(report.resources[objectStorageIndex]
  .plans[objectStoragePlanIdIndex].aggregated_usage[thousandLightAPICallsIndex].windows);
  
const getHeavyAPICallsWindows = (report) => _getCurrentMonth(report.resources[objectStorageIndex]
  .plans[objectStoragePlanIdIndex].aggregated_usage[heavyAPICallsIndex].windows);
  
const getSpaceThousandLightAPICallsWindows = (report) => getThousandLightAPICallsWindows(
  report.spaces[spaceIndex]);
  
const getSpaceHeavyAPICallsWindows = (report) => getHeavyAPICallsWindows(report.spaces[spaceIndex]);

const getConsumerThousandLightAPICallsWindows = (report) => getThousandLightAPICallsWindows(
  report.spaces[spaceIndex].consumers[consumerIndex]);
  
const getConsumerHeavyAPICallsWindows = (report) => getHeavyAPICallsWindows(
  report.spaces[spaceIndex].consumers[consumerIndex]);  
  
const cleanReport = (report) => _removeConsumerMetadata(
  clone(omit(report, 'id', 'processed', 'processed_id', 'start', 'end')));  
  
const getThousandLightAPICallsQuantity = (report) => {
  if(!_reportReady(report)) 
    return 0;

  const monthReport = getThousandLightAPICallsWindows(report);
  return monthReport.quantity;

};

module.exports = {
  cleanReport,
  getHeavyAPICallsWindows,
  getThousandLightAPICallsWindows,
  getThousandLightAPICallsQuantity,
  getSpaceThousandLightAPICallsWindows,
  getSpaceHeavyAPICallsWindows,
  getConsumerThousandLightAPICallsWindows,
  getConsumerHeavyAPICallsWindows
};
