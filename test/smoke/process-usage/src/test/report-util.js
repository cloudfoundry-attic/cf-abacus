'use stict';

const clone = require('abacus-clone');

const { each, omit, extend } = require('underscore');

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

  const resourceInstancens = report.spaces[spaceIndex].consumers[consumerIndex].resources[objectStorageIndex]
    .plans[objectStoragePlanIdIndex].resource_instances;
  
  resourceInstancens[testResourceInstanceIndex] = omit(resourceInstancens[testResourceInstanceIndex], 't', 'p');
  
  return report;
};

const _removePreviousWindowsFromWindows = (windows) => [
  [null],
  [null],
  [null],
  [windows[3][0]],
  [windows[4][0]]
];

const _removePreviousWindowsFromAggregatedUsage = (aggregatedUsage) => {
  const result = [];
  each(aggregatedUsage, (metric) => {
    result.push(extend({}, metric, { windows: _removePreviousWindowsFromWindows(metric.windows)
    }));
  });

  return result;
}; 

const _removePreviousWindowsFromPlans = (plans) => {
  const result = [];
  each(plans, (plan) => {
    result.push(extend({}, plan, { 
      aggregated_usage: _removePreviousWindowsFromAggregatedUsage(plan.aggregated_usage)
    }));
  });
  return result;
};

const _removeWindowsFromResources = (resources) => {
  const resultResources = [];  
  each(resources, (resource) => {

    resultResources.push(extend({}, resource, 
      { aggregated_usage: _removePreviousWindowsFromAggregatedUsage(resource.aggregated_usage), 
        plans: _removePreviousWindowsFromPlans(resource.plans)
      }));

  });

  return resultResources;
};

const _removeWindowsFromConsumers = (consumers) => {
  const resultConsumers = [];
  each(consumers, (consumer) => {
    resultConsumers.push(extend({}, consumer, {
      resources: _removeWindowsFromResources(consumer.resources)
    }));
  });

  return resultConsumers;
};

const _removeWindowsFromSpaces = (spaces) => {
  const resultSpaces = [];

  each(spaces, (space) => { 
    resultSpaces.push(extend({}, space, {
      resources: _removeWindowsFromResources(space.resources),
      consumers: _removeWindowsFromConsumers(space.consumers)
    }));
  });

  return resultSpaces;
};

const _removePreviousWindows = (report) => {
  if(!_reportReady(report))
    throw new Error('Empty report');

  const resources = _removeWindowsFromResources(report.resources);
  const spaces = _removeWindowsFromSpaces(report.spaces);

  return extend({}, report, {
    resources: resources,
    spaces: spaces
  });
}; 

const getStorageUsage = (report) => {
  if(!_reportReady(report))
    return 0;

  return _getStorageWindows(report).quantity;
};

const cleanReport = (report) => _removePreviousWindows(_removeConsumerMetadata(
  clone(omit(report, 'id', 'processed', 'processed_id', 'start', 'end'))));

module.exports = {
  getStorageUsage,
  cleanReport
};
