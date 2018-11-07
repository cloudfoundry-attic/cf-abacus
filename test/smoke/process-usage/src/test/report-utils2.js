'use strict';

const { each, find, clone, omit, extend } = require('underscore');

const _findResourceById = (resourceId, resources) => {
  const resource = find(resources, (resource) => resource.resource_id === resourceId);

  if(!resource) 
    throw new Error('Missing resource with id %s', resourceId);

  return resource;
}; 

const _findMetricByName = (metricName, aggregatedUsage) => {
  const metric = find(aggregatedUsage, (metric) => metric.metric === metricName);  

  if(!metric) 
    throw new Error('Missing metric %s', metric.metric);

  return metric;
};

const _findPlanById = (planID, plans) => {
  const plan = find(plans, (plan) => plan.plan_id === planID); 

  if(!plan)
    throw new Error('Missing plan with planID %s', planID);

  return plan;  
};

const _findSpaceById = (spaceID, spaces) => {
  const space = find(spaces, (space) => space.space_id === spaceID); 

  if(!space)
    throw new Error('Missing space with spaceID %s', spaceID);

  return space;
}; 

const _findConsumerById = (consumerID, consumers) => {
  const consumer = find(consumers, (consumer) => consumer.consumer_id === consumerID); 

  if(!consumer)
    throw new Error('Missing consumer with consumerID %s', consumerID);

  return consumer;  
};

const _subtractWindowValues = (valueA, valueB) => valueA - valueB === 0 ? valueA : valueA - valueB;

const _subtractWindows = (windowsA, windowsB) => {
  const resultWindows = [];
  each(windowsA, (window, windowIndex) => {
    if(!windowsB[windowIndex])
      throw new Error('Invalid report');
    // check size
    if(window.length !== windowsB[windowIndex].length)  
      throw new Error('Missing aggregated usage demension');
    
    const resultWindow = [];
      
    each(window, (element, index) => {
      if(element) 
        resultWindow.push({
          summary: _subtractWindowValues(element.summary, windowsB[windowIndex][index].summary),
          quantity: _subtractWindowValues(element.quantity, windowsB[windowIndex][index].quantity)
        });
      else
        resultWindow.push(null);
    }); 
    resultWindows.push(resultWindow);
  });
  return resultWindows;
};

const _subtractAggregatedUsages = (aggregatedUsageA, aggregatedUsageB) => {
  const resultAggregatedUsage = [];
  each(aggregatedUsageA, (au) => {

    resultAggregatedUsage.push({
      metric: au.metric,
      windows: _subtractWindows(au.windows, _findMetricByName(au.metric, aggregatedUsageB).windows)
    });
    
  });
  return resultAggregatedUsage;
};

const _subtractPlans = (plansA, plansB) => {
  const resultPlans = [];
  each(plansA, (planA) => {
    resultPlans.push(extend(clone(omit(planA, 'aggregated_usage')), { 
      aggregated_usage: _subtractAggregatedUsages(planA.aggregated_usage, 
        _findPlanById(planA.plan_id, plansB).aggregated_usage)}));
  });
  return resultPlans;
};

const _subtractResources = (resourcesA, resourcesB) => {
  if(!resourcesB || resourcesB.length === 0)
    return resourcesA;

  const resultResources = [];
  
  each(resourcesA, (resourceA) => {
    const resourceB = _findResourceById(resourceA.resource_id, resourcesB);
    resultResources.push({
      resource_id: resourceA.resource_id,
      plans: _subtractPlans(resourceA.plans, resourceB.plans),
      aggregated_usage: _subtractAggregatedUsages(resourceA.aggregated_usage, resourceB.aggregated_usage)
    });
  });
  return resultResources;
};

const _subtractConsumers = (consumersA, consumersB) => {
  const resultConsumers = [];
  
  each(consumersA, (consumerA) => {
    resultConsumers.push({
      consumer_id: consumerA.consumer_id,
      resources: _subtractResources(consumerA.resources, _findConsumerById(consumerA.consumer_id, consumersB).resources)
    });
  });
  return resultConsumers;
};

const _subtractSpaces = (spacesA, spacesB) => {
  if(!spacesB || spacesB.length === 0)
    return spacesA;
  
  const resultSpaces = [];
  
  each(spacesA, (spaceA) => {
    const spaceB = _findSpaceById(spaceA.space_id, spacesB);
    resultSpaces.push({
      space_id: spaceA.space_id,
      resources: _subtractResources(spaceA.resources, spaceB.resources),
      consumers: _subtractConsumers(spaceA.consumers, spaceB.consumers)
    });
  });  
  return resultSpaces;
}; 

const subtractReports = (reportA, reportB) => {
  const subtractedResources = _subtractResources(reportA.resources, reportB.resources);
  const subtractedSpaces = _subtractSpaces(reportA.spaces, reportB.spaces); 
  
  return {
    organization_id: reportA.organization_id,
    resources: subtractedResources,
    spaces: subtractedSpaces,
    account_id: reportA.account_id
  };
};

module.exports = {
  subtractReports
};
