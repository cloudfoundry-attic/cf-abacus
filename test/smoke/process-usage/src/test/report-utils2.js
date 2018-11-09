'use strict';

const { each, clone, omit, extend } = require('underscore');

const { findResourceById, findMetricByName, findPlanById, findSpaceById, findConsumerById } = require('./finder');

// const _subtractWindowValues = (valueA, valueB) => valueA - valueB === 0 ? valueA : valueA - valueB;

const _subtractWindows = (updatedWindows, initilaWindows) => {
  const resultWindows = [];
  each(updatedWindows, (window, windowIndex) => {
    if(!initilaWindows[windowIndex])
      throw new Error('Invalid report');
    
    const resultWindow = [];
      
    each(window, (element, index) => {
      if(element) 
        resultWindow.push({
          summary: element.summary - initilaWindows[windowIndex][index].summary,
          quantity: element.quantity - initilaWindows[windowIndex][index].quantity
        });
      else
        resultWindow.push(null);
    }); 
    resultWindows.push(resultWindow);
  });
  return resultWindows;
};

const _subtractAggregatedUsages = (updatedAggregatedUsage, initialAggregatedUsage) => {
  const resultAggregatedUsage = [];
  each(updatedAggregatedUsage, (au) => {

    resultAggregatedUsage.push({
      metric: au.metric,
      windows: _subtractWindows(au.windows, findMetricByName(au.metric, initialAggregatedUsage).windows)
    });
    
  });
  return resultAggregatedUsage;
};

const _subtractPlans = (updatedPlans, initialPlans) => {
  const resultPlans = [];
  each(updatedPlans, (updatedPlan) => {
    resultPlans.push(extend(clone(omit(updatedPlan, 'aggregated_usage')), { 
      aggregated_usage: _subtractAggregatedUsages(updatedPlan.aggregated_usage, 
        findPlanById(updatedPlan.plan_id, initialPlans).aggregated_usage)}));
  });
  return resultPlans;
};

const _subtractResources = (updatedResources, initialResources) => {
  if(!initialResources || initialResources.length === 0)
    return updatedResources;

  const resultResources = [];
  
  each(updatedResources, (updatedResource) => {
    const initialResource = findResourceById(updatedResource.resource_id, initialResources);
    resultResources.push({
      resource_id: updatedResource.resource_id,
      plans: _subtractPlans(updatedResource.plans, initialResource.plans),
      aggregated_usage: _subtractAggregatedUsages(updatedResource.aggregated_usage, initialResource.aggregated_usage)
    });
  });
  return resultResources;
};

const _subtractConsumers = (updatedConsumers, initialConsumers) => {
  const resultConsumers = [];
  
  each(updatedConsumers, (initialConsumer) => {
    resultConsumers.push({
      consumer_id: initialConsumer.consumer_id,
      resources: _subtractResources(initialConsumer.resources, 
        findConsumerById(initialConsumer.consumer_id, initialConsumers).resources)
    });
  });
  return resultConsumers;
};

const _subtractSpaces = (updatedSpaces, initialSpaces) => {
  if(!initialSpaces || initialSpaces.length === 0)
    return updatedSpaces;
  
  const resultSpaces = [];
  
  each(updatedSpaces, (updatedSpace) => {
    const initialSpace = findSpaceById(updatedSpace.space_id, initialSpaces);
    resultSpaces.push({
      space_id: updatedSpace.space_id,
      resources: _subtractResources(updatedSpace.resources, initialSpace.resources),
      consumers: _subtractConsumers(updatedSpace.consumers, initialSpace.consumers)
    });
  });  
  return resultSpaces;
}; 

const subtractReports = (updated, initial) => ({
  organization_id: updated.organization_id,
  resources: _subtractResources(updated.resources, initial.resources),
  spaces: _subtractSpaces(updated.spaces, initial.spaces),
  account_id: updated.account_id
});

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

const getStorageUsage = (report) => {
  if(!_reportReady(report))
    return 0;

  return _getStorageWindows(report).quantity;
};

module.exports = {
  getStorageUsage,
  subtractReports
};
