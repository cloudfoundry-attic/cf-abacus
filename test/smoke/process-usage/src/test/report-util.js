'use stict';

const clone = require('abacus-clone');

const { omit } = require('underscore');

const monthReport = 4;
const currentMonth = 0;
const objectStorageIndex = 0;
const objectStoragePlanIdIndex = 0;

const _getCurrentMonth = (windows) => windows[monthReport][currentMonth];

const _getStorageWindows = (report) => _getCurrentMonth(report.resources[objectStorageIndex]
  .plans[objectStoragePlanIdIndex].aggregated_usage[0].windows);

const _reportReady = (report) => {
  const resources = report.resources;
  return resources && resources.length !== 0;
};

const _removeConsumerMetadata = (report) => {
  if(!_reportReady(report))
    throw new Error('Empty report');

  const testResourceInstanceIndex = 0;
  const consumerIndex = 0;
  const spaceIndex = 0;

  report.spaces[spaceIndex].consumers[consumerIndex].resources[objectStorageIndex].plans[objectStoragePlanIdIndex]
    .resource_instances[testResourceInstanceIndex] = omit(report.spaces[spaceIndex].consumers[consumerIndex]
      .resources[objectStorageIndex].plans[objectStoragePlanIdIndex].resource_instances[testResourceInstanceIndex],
    't',
    'p'
    );
  return report;
};

const getStorageUsage = (report) => {
  if(!_reportReady(report))
    return 0;

  return _getStorageWindows(report).quantity;
};

const cleanReport = (report) => _removeConsumerMetadata(
  clone(omit(report, 'id', 'processed', 'processed_id', 'start', 'end')));

module.exports = {
  getStorageUsage,
  cleanReport
};
